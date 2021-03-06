/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the 'License'). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

// @flow

import * as actions from '../actions';
import WebExtensionChannels from '../metrics/webextension-channels';

import typeof self from 'sdk/self';
import typeof tabs from 'sdk/tabs';
import type { Action, Dispatch, GetState, ReduxStore } from 'testpilot/types';
import type { Env } from '../actionCreators/env';
import type FeedbackManager from '../actionCreators/FeedbackManager';
import type InstallManager from '../actionCreators/InstallManager';
import type Loader from '../actionCreators/Loader';
import type Telemetry from '../Telemetry';
import type MainUI from '../actionCreators/MainUI';
import type WebApp from '../WebApp';

export type Context = {
  dispatch: Dispatch,
  getState: GetState,
  env: Env,
  feedbackManager: FeedbackManager,
  hacks: Object,
  installManager: InstallManager,
  loader: Loader,
  self: self,
  tabs: tabs,
  telemetry: Telemetry,
  ui: MainUI,
  webapp: WebApp
};

export type SideEffect = (context: Context) => void;

let context = {};
let unsubscribe = nothing;

export function nothing() {}

export function reducer(
  state: Function = nothing,
  { payload, type }: Action
): SideEffect {
  switch (type) {
    case actions.LOAD_EXPERIMENTS.type:
      return ({ loader }) => {
        loader.loadExperiments(payload.envname, payload.baseUrl);
      };

    case actions.EXPERIMENT_ENABLED.type:
    case actions.INSTALL_ENDED.type:
      return ({ hacks, telemetry }) => {
        const id = payload.experiment.addon_id;
        WebExtensionChannels.add(id);
        telemetry.ping(id, 'enabled');
        hacks.enabled(id);
      };

    case actions.EXPERIMENT_DISABLED.type:
    case actions.EXPERIMENT_UNINSTALLING.type:
      return ({ hacks, telemetry }) => {
        const id = payload.experiment.addon_id;
        WebExtensionChannels.remove(id);
        telemetry.ping(id, 'disabled');
        hacks.disabled(id);
      };

    case actions.EXPERIMENTS_LOADED.type:
      return ({ dispatch, loader }) => {
        loader.schedule();
        Object.keys(payload.experiments)
          .map(id => payload.experiments[id])
          .filter(x => x.uninstalled && new Date(x.uninstalled) < new Date())
          .forEach(experiment =>
            dispatch(actions.UNINSTALL_EXPERIMENT({ experiment })));
      };

    case actions.INSTALL_EXPERIMENT.type:
      return ({ installManager }) =>
        installManager.installExperiment(payload.experiment);

    case actions.UNINSTALL_EXPERIMENT.type:
      return ({ installManager }) =>
        installManager.uninstallExperiment(payload.experiment);

    case actions.UNINSTALL_SELF.type:
      return ({ installManager }) => installManager.uninstallSelf();

    case actions.CHANGE_ENV.type:
      return ({ env, dispatch, webapp }) => {
        const e = env.get();
        webapp.changeEnv(e);
        dispatch(
          actions.LOAD_EXPERIMENTS({ envname: e.name, baseUrl: e.baseUrl })
        );
      };

    case actions.SET_BASE_URL.type:
      return ({ dispatch, env }) => {
        const e = env.get();
        const baseUrl = e.baseUrl;
        dispatch(actions.LOAD_EXPERIMENTS({ envname: e.name, baseUrl }));
      };

    case actions.GET_INSTALLED.type:
      return ({ installManager }) => installManager.syncInstalled();

    case actions.SHOW_RATING_PROMPT.type:
      return ({ feedbackManager }) => {
        feedbackManager.promptRating(payload);
      };

    case actions.SET_RATING.type:
      return ({ telemetry }) => {
        telemetry.ping(payload.experiment.addon_id, `rated_${payload.rating}`);
      };

    case actions.SET_BADGE.type:
      return ({ ui }) => ui.setBadge();

    case actions.MAIN_BUTTON_CLICKED.type:
      return ({ getState, ui, tabs, telemetry }) => {
        ui.setBadge();
        tabs.open({
          url: getState().baseUrl +
            '/experiments?utm_source=testpilot-addon&utm_medium=firefox-browser&utm_campaign=testpilot-doorhanger&utm_content=not+badged'
        });
        telemetry.ping('txp_toolbar_menu_1', 'clicked');
      };

    case actions.PROMPT_SHARE.type:
      return ({ feedbackManager }) => {
        feedbackManager.promptShare(payload.url);
      };

    case actions.ADDONS_CHANGED.type:
      return ({ installManager }) => {
        installManager.syncInstalled();
      };

    default:
      return nothing;
  }
}

export function setContext(ctx: Context) {
  context = ctx;
}

export function enable(store: ReduxStore) {
  unsubscribe = store.subscribe(() => store.getState().sideEffects(context));
}

export function disable() {
  unsubscribe();
  unsubscribe = nothing;
}
