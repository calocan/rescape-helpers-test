import {regionOutputParams, regionOutputParamsMinimum, userRegionsQueryContainer} from 'rescape-place';
import {adopt} from 'react-adopt';
import * as R from 'ramda';
import {makeMutationRequestContainer, makeQueryContainer} from 'rescape-apollo';

// The __typename that represent the fields of the Region type. We need these to query by object types rather than
// just by primitives, e.g. to query by geojson: {feature: {type: 'FeatureCollection'}} to get objects whose
// geojson type is a 'FeatureCollection'
// TODO, these should be derived from the remote schema
export const readInputTypeMapper = {
  //'data': 'DataTypeofLocationTypeRelatedReadInputType'
  'geojson': 'FeatureCollectionDataTypeofRegionTypeRelatedReadInputType'
};

// Sample query of the region object that is in the rescape-apollo remote schema
const _makeRegionsQueryContainer = R.curry((apolloConfig, {outputParams}, props) => {
  return makeQueryContainer(
    apolloConfig,
    {name: 'regions', readInputTypeMapper, outputParams},
    props
  );
});

// Sample mutation of the region object that is in the rescape-apollo remote schema
export const _makeRegionMutationContainer = R.curry((apolloConfig, {outputParams}, props) => {
  return makeMutationRequestContainer(
    apolloConfig,
    {
      name: 'region',
      outputParams
    },
    props
  );
});

/**
 * Each query and mutation expects a container to compose then props
 * @param {Object} apolloConfig Optionally supply {apolloClient} to run requests as tasks instead of components
 * @return {{queryRegions: (function(*=): *), mutateRegion: (function(*=): *), queryUserRegions: (function(*=): *)}}
 */
export const apolloContainers = (apolloConfig = {}) => {
  return {
    // Creates a function expecting a component to wrap and props
    queryRegions: props => {
      return _makeRegionsQueryContainer(
        R.merge(apolloConfig,
          {
            options: {
              variables: (props) => {
                return {
                  id: parseInt(props.region.id)
                };
              },
              // Pass through error so we can handle it in the component
              errorPolicy: 'all'
            }
          }
        ),
        {
          outputParams: regionOutputParams
        },
        props
      );
    },

    // Test sequential queries
    queryUserRegions: props => {
      return userRegionsQueryContainer(
        R.merge(apolloConfig,
          {
            options: {
              variables: props => {
                // The props given to this are the userState id and user
                // Pick the id of the UserState
                return R.pick(['id'], props); //R.map(R.pick(['id']), R.pick(['userState'], props));
              },
              // Pass through error so we can handle it in the component
              errorPolicy: 'all'
            }
          }),
        {
          // We currently query for the region id, key, and name
          // We might want the geojson too so we can display it to the user on a map
          regionOutputParams: regionOutputParamsMinimum
        },
        // We just need the userState and scope
        R.pick(['render', 'children', 'userState', 'scope'], props)
      );
    },

    mutateRegion: props => {
      return _makeRegionMutationContainer(
        R.merge(apolloConfig, {
          options: {
            variables: (props) => {
              return R.propOr({}, 'region', props);
            },
            errorPolicy: 'all'
          }
        }),
        {
          outputParams: regionOutputParams
        }
      )(props);
    }
  };
};

// This produces a component class that expects a props object keyed by the keys in apolloContainers
// The value at each key is the result of the corresponding query container or the mutate function of the corresponding
// mutation container
const AdoptedApolloContainer = adopt(apolloContainers());
// Wrap AdoptedApolloContainer in
//const apolloHoc = apolloHOC(AdoptedApolloContainer);
export default AdoptedApolloContainer;
