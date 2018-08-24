import { isEqual } from 'lodash';
import { getWorkpad, getWorkpadPersisted } from '../selectors/workpad';
import { getAssetIds } from '../selectors/assets';
import { setWorkpad } from '../actions/workpad';
import { setAssets, resetAssets } from '../actions/assets';
import * as transientActions from '../actions/transient';
import * as resolvedArgsActions from '../actions/resolved_args';
import { update } from '../../lib/workpad_service';
import { notify } from '../../lib/notify';

const workpadChanged = (before, after) => {
  const workpad = getWorkpad(before);
  return getWorkpad(after) !== workpad;
};

const assetsChanged = (before, after) => {
  const assets = getAssetIds(before);
  return !isEqual(assets, getAssetIds(after));
};

// these are the actions we don't want to trigger a persist call
const skippedActions = [
  setWorkpad, // used for loading and creating workpads
  setAssets, // used when loading assets
  resetAssets, // used when creating new workpads
  ...Object.values(resolvedArgsActions), // no resolved args affect persisted values
  ...Object.values(transientActions), // no transient actions cause persisted state changes
].map(a => a.toString());

export const esPersistMiddleware = ({ getState }) => next => action => {
  // if the action is in the skipped list, do not persist
  if (skippedActions.indexOf(action.type) >= 0) return next(action);

  // capture state before and after the action
  const curState = getState();
  next(action);
  const newState = getState();

  // if the workpad changed, save it to elasticsearch
  if (workpadChanged(curState, newState) || assetsChanged(curState, newState)) {
    const persistedWorkpad = getWorkpadPersisted(getState());
    return update(persistedWorkpad.id, persistedWorkpad).catch(err => {
      if (err.response.status === 400) {
        return notify.error(err.response, {
          title: `Couldn't save your changes to Elasticsearch`,
        });
      }
      return notify.error(err.response, {
        title: `Couldn't update workpad`,
      });
    });
  }
};
