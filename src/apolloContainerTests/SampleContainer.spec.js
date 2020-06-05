import * as R from 'ramda';
import Sample, {c} from './SampleComponent';
import SampleContainer, {apolloContainers} from './SampleContainer';
import {apolloConfigToPropsResultTask} from './SampleContainer.sample';
import {localTestAuthTask} from 'rescape-apollo';
import {apolloContainerTests} from '../apolloContainerTestHelpers';

// Test this container
const container = SampleContainer;
// Test container with this render component
const component = Sample

// Find this React component
const componentName = 'Sample';
// Find this class in the data renderer
const childClassDataName = c.sampleMapboxOuter;
// Find this class in the loading renderer
const childClassLoadingName = c.sampleLoading;
// Find this class in the error renderer
const childClassErrorName = c.sampleError;
// Error maker creates an unknown id that can't be queried
const errorMaker = parentProps => R.set(R.lensPath(['region', 'id']), 'foo', parentProps);
const omitKeysFromSnapshots = ['id', 'key', 'createdAt', 'updatedAt'];
// We expect calling mutateRegion to update the updatedAt of the queryRegions response
const updatedPaths = {mutateRegion: {component: ['queryRegions.data.regions.0.updatedAt'], client: ['data.mutate.region']}};

describe('SampleContainer', () => {

  const {testComposeRequests, testQueries, testMutations, testRenderError, testRender} = apolloContainerTests(
    {
      componentContext: {
        name: componentName,
        statusClasses: {
          data: childClassDataName,
          loading: childClassLoadingName,
          error: childClassErrorName
        }
      },
      apolloContext: {
        state: {},
        apolloConfigTask: localTestAuthTask(),
        // This is called with one argument, null or and apolloConfig to return the containers
        apolloContainers
      },
      reduxContext: {},
      testContext: {
        errorMaker,
        // Don't snapshot compare these non-deterministic keys on any object
        omitKeysFromSnapshots,
        // This value should change when we mutate
        updatedPaths
      }
    },
    container,
    component,
    apolloConfigToPropsResultTask
  );
  test('testComposeRequests', testComposeRequests, 1000000);
  test('testQueries', testQueries, 1000000);
  test('testMutations', testMutations, 1000000);
  test('testRender', testRender, 1000000);
  test('testRenderError', testRenderError, 100000);
});

