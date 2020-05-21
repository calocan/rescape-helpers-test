/**
 * Created by Andy Likuski on 2018.12.31
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as R from 'ramda';
import PropTypes from 'prop-types';
import {v} from 'rescape-validate';
import {
  makeRegionsQueryContainer,
  regionOutputParams as defaultRegionOutputParams
} from './regionStore';
import {makeUserStateScopeObjsQueryContainer} from './scopeHelpers';
import {
  userRegionsOutputParamsFragmentDefaultOnlyIds,
  userStateOutputParamsCreator,
  userStateReadInputTypeMapper
} from './userStateStore';
import {reqStrPathThrowing, strPathOr} from 'rescape-ramda';

/**
 * Queries regions that are in the scope of the user and the values of that region
 * @param {Object} apolloConfig Configuration of the Apollo Client when using one instead of an Apollo Component
 * @param {Object} apolloConfig.apolloClient An authorized Apollo Client
 * @param {Object} outputParamSets Optional outputParam sets to override the defaults
 * @param {Object} [outputParamSets.regionOutputParams] Optional region output params.
 * Defaults to regionStore.regionOutputParams
 * @param {Object} userStateArguments arguments for the UserStates query. {user: {id: }} is required to limit
 * the query to one user
 * @param {Object} propSets The props used for the query. userState objects are required
 * @param {Object} propSets.userState Props for the UserStates query. {user: {id: }} is required to limit
 * the query to one user
 * @param {Object} propSets.region Props for the Regions query. This can be {} or null to not filter.
 * @returns {Object} The resulting Regions in a Task in {data: usersRegions: [...]}}
 */
export const userRegionsQueryContainer = v(R.curry(
  (apolloConfig, {regionOutputParams}, propSets) => {
    return makeUserStateScopeObjsQueryContainer(
      apolloConfig,
      {
        scopeQueryContainer: makeRegionsQueryContainer,
        scopeName: 'region',
        readInputTypeMapper: userStateReadInputTypeMapper,
        userStateOutputParamsCreator: scopeOutputParams => {
          const params = userStateOutputParamsCreator(
            userRegionsOutputParamsFragmentDefaultOnlyIds(scopeOutputParams)
          );
          return params
        },
        scopeOutputParams: regionOutputParams || defaultRegionOutputParams
      },
      propSets
    )
  }),
  [
    ['apolloConfig', PropTypes.shape({apolloClient: PropTypes.shape()}).isRequired],
    ['outputParamSets', PropTypes.shape({
      regionOutputParams: PropTypes.shape()
    })],
    ['propSets', PropTypes.shape({
      userState: PropTypes.shape({
        user: PropTypes.shape({
          id: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.number
          ])
        }).isRequired
      }).isRequired,
      region: PropTypes.shape()
    })]
  ], 'userRegionsQueryContainer');
