/**
 * Created by Andy Likuski on 2017.12.26
 * Copyright (c) 2017 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {act} from 'react-dom/test-utils';
import {mountWithApolloClient, waitForChildComponentRenderTask} from './componentTestHelpers';
import {e, getClass} from 'rescape-helpers-component';
import PropTypes from 'prop-types';
import {v} from 'rescape-validate';
import {fromPromised, of, waitAll} from 'folktale/concurrency/task';
import {
  chainMDeep,
  composeWithChain,
  composeWithChainMDeep,
  defaultRunConfig,
  filterWithKeys,
  mapObjToValues,
  mapToMergedResponseAndInputs,
  mapToNamedResponseAndInputs,
  omitDeep,
  reqStrPathThrowing
} from 'rescape-ramda';
import * as R from 'ramda';
import Result from 'folktale/result';
import {loggers} from 'rescape-log';
import {apolloQueryResponsesTask, createRequestVariables} from 'rescape-apollo';
import {adopt} from 'react-adopt';

const log = loggers.get('rescapeDefault');


/**
 * Processes a apolloConfigToPropsResultTask representing parent props. props
 * Resolve the Result to the Result.ok value or throw if Result.Error
 * samplePropsResultTask returns and Result so that the an error
 * in the query can be processed by detected a Result.Error value, but here
 * we only accept a Result.Ok
 * @param {function} apolloConfigTaskToPropsResultTask Expects a schema task and returns a Task Result.Ok|Result.Error
 * @param {Task} apolloConfigTask Resolves to a {schema, apollo}
 * @return {*}
 */
const parentPropsTask = (apolloConfigTaskToPropsResultTask, apolloConfigTask) => {
  return composeWithChainMDeep(1, [
    propsResult => {
      return of(propsResult.matchWith({
        Ok: ({value}) => value,
        Error: ({value: error}) => {
          // Unacceptable!
          if (R.is(Object, error)) {
            // GraphQL error(s)
            const errors = R.propOr([], 'error', error);
            R.forEach(error => {
              log.error(error);
              if (R.equals(error, R.last(errors)))
                // throw the last error to quit, at least we logged all of them first
                throw error;
            }, errors);

          }
          throw error;
        }
      }));
    },
    apolloConfigTask => {
      return apolloConfigTaskToPropsResultTask(apolloConfigTask);
    }
  ])(apolloConfigTask);
};

/**
 * Filter for just the query containers of the given apolloContainers
 * @param {Object} apolloContainers Keyed by request name and valued by apollo request container.
 * Only those beginning with 'query' are considered
 * @return {*}
 */
export const filterForQueryContainers = apolloContainers => {
  return filterWithKeys(
    (_, key) => {
      return R.includes('query', key);
    },
    apolloContainers
  );
};

/***
 * Filter for just the mutation containers of the given apolloContainers
 * @param {Object} apolloContainers Keyed by request name and valued by apollo request container.
 * Only those beginning with 'mutat' are considered
 * @return {*}
 */
export const filterForMutationContainers = apolloContainers => {
  return filterWithKeys(
    (_, key) => {
      return R.includes('mutat', key);
    },
    apolloContainers
  );
};

/**
 * Runs tests on an apollo React container with the * given config.
 * Even if the container being tested does not have an apollo query, this can be used
 * @param {Object} config
 * @param {String} config.componentName The name of the React component that the container wraps
 * @param {String} config.childClassDataName A class used in a React component in the named
 * component's renderData method--or any render code when apollo data is loaded
 * @param {Object|Task} config.schema A graphql schema or Task resolving to a schema that resolves queries to sample
 * values.
 * @param {String} [config.childClassLoadingName] Optional. A class used in a React component in the named
 * component's renderLoading method--or any render code called when apollo loading is true. Normally
 * only needed for components with queries.
 * @param {String} [config.childClassErrorName] Optional. A class used in a React component in the named
 * component's renderError method--or any render code called when apollo error is true. Normally only
 * needed for components with queries.
 * @param {Function} [config.apolloConfigToPropsResultTask] A Function that expects the Apollo schema as the unary
 * argument. Returns a task that resolves to all properties needed by the container.
 * The value must be an Result in case errors occur during loading parent data. An Result.Ok contains
 * successful props and Result.Error indicates an error that causes this function to throw
 * This can be done with constants, or as the name suggests by chaining all ancestor Components/Container props,
 * where the ancestor Container props might be Apollo based.
 * of the parentProps used to call propsFromSampleStateAndContainer. Required if the container component receives
 * props from its parent (it usually does)
 * @param {Function} [testContext.apolloContainers] Function expecting an optional apolloConfig and returning
 * Apollo Containers or Apollo Tasks. The tests below call this function with and empty value and then
 * wrap the result in adopt of react-adopt to make adopted Apollo components that render all of their
 * request results to a single render funcdtion. The tests also call this function with an apolloConfig that
 * contains an apolloClient to generate tasks out of the apollo containers. This is used for testQueries
 * and testMutations so we can see if the requests work as expected independent of a readct component
 * @param {Object} testContext
 * @param {Function} [testContext.errorMaker] Optional unary function that expects the results of the
 * @param {[String]} testContext.omitKeysFromSnapshots Keys to not snapshot test because
 * values aren't deterministic. This must at least include id and should include dates that change.
 * The keys are omitted from all result objects deep prior to snapshot testing
 * @param {[{Object}]} testContext.updatedPaths Paths to values that should change between mutations.
 * This only works for things like update date or instance version number that change every mutation.
 * It's in the form {component: path, client: path}. For component we use the result of querying after mutation,
 * since we do all requests. For client tests we test the difference between mutating twice
 * @param {Object} HOC Apollo container created by calling react-adopt or similar
 * @param {Object} component. The child component to container having a render function that receives
 * the results of the apollo requests from container
 * @param {Function} apolloConfigTaskToPropsResultTask A function expecting the schema and resolving to the props in a Task<Result.Ok>
 * parentProps and mutates something used by the queryVariables to make the query fail. This
 * is for testing the renderError part of the component. Only containers with queries should have an expected error state
 *    {
      testMapStateToProps,
      testQueries,
      testMutations,
      testRenderError,
      testRender
    };
 */
export const apolloContainerTests = v((context, container, component, apolloConfigToPropsResultTask) => {
    const {
      componentContext: {
        name: componentName,
        statusClasses: {
          data: childClassDataName,
          loading: childClassLoadingName,
          error: childClassErrorName
        }
      },
      apolloContext: {
        apolloConfigTask,
        apolloContainers
      },
      testContext: {
        errorMaker,
        omitKeysFromSnapshots,
        updatedPaths
      }
    } = context;

    // Optional, A Task that resolves props all the way up the hierarchy chain, ending with props for this
    // container based on the ancestor Containers/Components
    const resolvedPropsTask = R.ifElse(
      R.identity,
      apolloConfigTaskToPropsResultTask => {
        return parentPropsTask(apolloConfigTaskToPropsResultTask, apolloConfigTask);
      },
      () => of({})
    )(apolloConfigToPropsResultTask);

    /**
     * Tests that we can mount the composed request container
     * @param done
     */
    const testComposeRequests = done => {
      expect.assertions(1);
      const errors = [];
      composeWithChain([
        mapToMergedResponseAndInputs(
          // Resolves to {schema, apolloClient}
          () => apolloConfigTask
        ),
        mapToNamedResponseAndInputs('props',
          () => resolvedPropsTask
        )
      ])({}).run().listen(
        defaultRunConfig({
          onResolved: ({props, apolloClient}) => {
            const component = mountWithApolloClient(
              {apolloClient},
              e(container, props)
            );
            expect(R.length(component)).toBe(1);
          }
        }, errors, done)
      );
    };


    /**
     * For Apollo Containers with queries, tests that the query results match the snapshot
     */
    const testQueries = done => _testQueries(
      {
        apolloConfigTask,
        resolvedPropsTask,
        omitKeysFromSnapshots
      },
      apolloConfig => filterForQueryContainers(apolloContainers(apolloConfig)),
      done
    );

    /**
     * For Apollo Containers with mutations, tests that the mutation results match the snapshot
     */
    const testMutations = done => _testMutations(
      {
        apolloConfigTask,
        resolvedPropsTask,
        omitKeysFromSnapshots,
        updatedPaths
      },
      apolloConfig => filterForMutationContainers(apolloContainers(apolloConfig)),
      done
    );


    /**
     * Tests that the correct child class renders and that the child component props match the snapshot
     * @param done
     * @return {Promise<void>}
     */
    const testRender = done => {
      _testRender(
        {
          apolloConfigTask,
          resolvedPropsTask,
          componentName,
          childClassDataName,
          childClassLoadingName,
          omitKeysFromSnapshots,
          mutationComponents: filterForMutationContainers(apolloContainers({})),
          updatedPaths
        },
        container,
        component,
        done
      );
    };

    /**
     * For components with an error state, tests that the error component renders
     * @param done
     * @return {Promise<void>}
     */
    const testRenderError = done => {
      _testRenderError(
        {
          errorMaker,
          apolloConfigTask,
          resolvedPropsTask,
          componentName,
          childClassErrorName,
          childClassLoadingName,
        },
        container,
        component,
        done
      );
    };

    return {
      testComposeRequests,
      testQueries,
      testMutations,
      testRenderError,
      testRender
    };
  },
  [
    ['config', PropTypes.shape({
        componentContext: PropTypes.shape({
          name: PropTypes.string.isRequired,
          statusClasses: PropTypes.shape({
            data: PropTypes.string.isRequired,
            loading: PropTypes.string,
            error: PropTypes.string
          })
        }),
        apolloContext: PropTypes.shape({
          apolloConfigTask: PropTypes.shape().isRequired,
          requests: PropTypes.shape()
        }),
        testContext: PropTypes.shape({
          errorMaker: PropTypes.func
        })
      }
    )],
    ['container', PropTypes.func.isRequired],
    ['component', PropTypes.func.isRequired],
    ['propsResultTask', PropTypes.func.isRequired]
  ], 'apolloContainerTests');


/**
 * Runs an apollo queries test and asserts results
 * @param apolloConfigTask
 * @param resolvedPropsTask
 * @param mapStateToProps
 * @param {Function} apolloConfigToQueryTasks Function expecting an apolloConfig and returning the query tasks
 * @param done
 * @return void
 * @private
 */
const _testQueries = (
  {
    apolloConfigTask,
    resolvedPropsTask,
    omitKeysFromSnapshots
  },
  apolloConfigToQueryTasks,
  done
) => {
  expect.assertions(1);
  const errors = [];
  if (!apolloConfigToQueryTasks) {
    console.warn("Attempt to run testQuery when query or queryVariables was not specified. Does your component actually need this test?");
    return;
  }
  apolloQueryResponsesTask({
    apolloConfigTask,
    resolvedPropsTask
  }, apolloConfigToQueryTasks).run().listen(
    defaultRunConfig({
      onResolved: responsesByKey => {
        // If we resolve the task, make sure there is no data.error
        R.forEach(
          data => {
            if (data.error)
              errors.push(data.error);
          },
          responsesByKey
        );
        expect(R.map(
          dataSet => {
            return omitDeep(omitKeysFromSnapshots, dataSet);
          },
          R.values(responsesByKey)
        )).toMatchSnapshot();
      }
    }, errors, done)
  );
};


/**
 * Runs an apollo mutation components to test and asserts results. Note that we also test the mutations
 * in _testRender by grabbing the render methods apollo component result props mutate functions,
 * so this is a bit redundant
 * @param config
 * @param config.apolloConfigTask
 * @param config.resolvedPropsTask
 * @param config.omitKeysFromSnapshots List of keys to remove before doing a snapshot test
 * @param {Function} apolloConfigToMutationTasks Expects an apolloConfig and returns an object keyed by
 * mutation name and valued by mutation task
 * @param done
 * @return void
 * @private
 */
const _testMutations = (
  {
    apolloConfigTask,
    resolvedPropsTask,
    omitKeysFromSnapshots,
    updatedPaths
  },
  apolloConfigToMutationTasks,
  done
) => {
  expect.assertions(1 + R.length(R.chain(R.prop('client'), R.values(updatedPaths))));

  const errors = [];
  if (!apolloConfigToMutationTasks) {
    console.warn("Attempt to run testMutation when apolloConfigToMutationTasks was not specified. Does your component actually need this test?");
    return;
  }
  // TODO Fix to work with mutationComponents and use Enzyme
  const apolloQueryResponsesTask = apolloMutationResponsesTask(
    {
      apolloConfigTask,
      resolvedPropsTask
    },
    apolloConfigToMutationTasks
  );
  apolloQueryResponsesTask.run().listen(
    defaultRunConfig({
      onResolved: prePostMutationComparisons => {
        testMutationChanges('client', updatedPaths, prePostMutationComparisons);
      }
    }, errors, done)
  );
};


/**
 * Runs the apollo mutations in mutationComponents
 * @param apolloConfigTask
 * @param resolvedPropsTask
 * @param {Function } apolloConfigToMutationTasks Expects an apolloConfig and returns and object keyed by mutation
 * name and valued by mutation tasks
 * @return {Task<[Object]>} A task resolving to a list of the mutation responses
 * @private
 */
export const apolloMutationResponsesTask = ({apolloConfigTask, resolvedPropsTask}, apolloConfigToMutationTasks) => {
  // Task Object -> Task
  return composeWithChain([
    // Wait for all the mutations to finish
    ({apolloConfigToMutationTasks, props, apolloClient}) => {
      // Create variables for the current queryComponent by sending props to its configuration
      const propsWithRender = R.merge(
        props, {
          // Normally render is a container's render function that receives the apollo request results
          // and pass is as props to a child container
          render: props => null
        }
      );
      log.debug(JSON.stringify(propsWithRender));
      return waitAll(
        mapObjToValues(
          (mutationExpectingProps, mutationName) => {
            return composeWithChain([
              ({preMutationApolloRenderProps, postMutationApolloRenderProps}) => of({
                mutationName,
                // Return the render props before and after the mutations so we can confirm that values changed
                preMutationApolloRenderProps,
                postMutationApolloRenderProps,
                mutationResponse: postMutationApolloRenderProps
              }),
              mapToNamedResponseAndInputs('postMutationApolloRenderProps',
                ({mutationExpectingProps, propsWithRender, preMutationApolloRenderProps}) => {
                  // Mutate again to get updated dates
                  return mutationExpectingProps(propsWithRender);
                }
              ),
              mapToNamedResponseAndInputs('preMutationApolloRenderProps',
                ({mutationExpectingProps, propsWithRender}) => {
                  // Mutate once
                  return mutationExpectingProps(propsWithRender);
                }
              )
            ])({mutationExpectingProps, propsWithRender});
          },
          apolloConfigToMutationTasks({apolloClient})
        )
      );
    },
    // Resolve the apolloConfigTask
    mapToMergedResponseAndInputs(
      ({}) => {
        return apolloConfigTask;
      }
    ),
    // Resolve the props from the task
    mapToNamedResponseAndInputs('props',
      () => {
        return resolvedPropsTask;
      }
    )
  ])({apolloConfigTask, resolvedPropsTask, apolloConfigToMutationTasks});
};

/**
 * Runs a render test. This asserts that the component enters the loading state, then the ready state
 * after queries have run, finally all mutationComponents' mutate function is called and we check
 * that values were updated
 * @param {Object} config
 * @param {Task} config.apolloConfigTask Resolves to a schema and apolloClient. The schema isn't needed but the apolloClient
 * is used to create an Apollo Provider component
 * @param {Task} config.resolvedPropsTask Task that resolves to test props to pass to the container. These
 * are in turned passed to the composed Apollo components and reach the component itself
 * @param {String} config.componentName The name of the component that receives the Apollo request results and mutate
 * functions from the componsed Apollo Containers
 * @param {String} config.childClassDataName Then mame of the top-level class created by the component when it is ready
 * @param {String} config.childClassLoadingName The name of the top-level class created by the component when loading
 * @param [{Function}] config.mutationComponents Apollo Mutation component functions expecting props
 * that then return a Mutation component. The mutation function of these is called by storing the
 * props that get passed to the component render function on the container. The container instance stores the properties
 * on _apolloRenderProps so we can access the mutation function. Otherwise we'd have to have special code
 * in the component render function to expose it, which we don't want
 * See the apolloHOC function
 * @param {Object<String:[String]>} config.updatedPaths Keyed by the mutation named and values by a list of path that we
 * expect our mutations changed. These should only be things like update timestamps since we mutate with the same values we had.
 * Make sure that each path begins with the query name whose results we are comparing with before and after.
 * Example: {mutationRegion: ['queryRegions.data.regions.0.updatedAt']} means "when I call mutatRegion, queryRegion's
 * result should update"
 * @param {Object} container The composed Apollo container. We create a react elmenet from this
 * with component as the children prop. component
 * props to create a component instance. The container is already composed with Apollo Query/Mutation components.
 * and it's render function passes the Apollo component results by name to its component
 * (which must be named componentName)
 * @param {Object} component The component that receives the results of queries and mutations and displays
 * loading, error, or data states
 * @param {Function} done jest done function
 * @return {*}
 * @private
 */
const _testRender = (
  {
    apolloConfigTask,
    resolvedPropsTask,
    componentName,
    childClassDataName,
    childClassLoadingName,
    mutationComponents,
    updatedPaths
  }, container, component, done) => {

  expect.assertions(
    // Assertions during processing
    2 +
    // Asserts that the child component was found
    1 +
    // One assertion per mutation component to prove the mutation function returned a value
    R.length(R.values(mutationComponents)) +
    // One per updated paths, which are keyed by mutation and valued by {component: [paths]}
    R.length(R.chain(R.prop('component'), R.values(updatedPaths)))
  );

  const errors = [];
  return composeWithChain([
    mapToNamedResponseAndInputs('prePostMutationComparisons',
      // Once we are loaded, we've already run queries, so only call mutation functions here.
      // This will update the component with the mutated data.
      // We don't actually change the values explicitly when we mutate here, so we assert it worked
      // by checking the object's update timestamp at the end of the test
      ({mutationComponents, wrapper, component, componentName, childClassDataName, props}) => {
        return _testRenderComponentMutations({mutationComponents, componentName, childClassDataName}, wrapper, component, props);
      }
    ),
    // Render component, calling queries
    mapToMergedResponseAndInputs(
      ({apolloClient, componentName, childClassLoadingName, childClassDataName, props}) => {
        return _testRenderComponent(
          {apolloClient, componentName, childClassLoadingName, childClassDataOrErrorName: childClassDataName},
          container,
          component,
          props
        );
      }
    ),
    // Resolve the apolloConfigTask. This resolves to {schema, apolloClient}
    mapToMergedResponseAndInputs(
      ({apolloConfigTask}) => apolloConfigTask
    ),
    mapToNamedResponseAndInputs('props',
      ({resolvedPropsTask}) => resolvedPropsTask
    )
  ])({
    apolloConfigTask,
    resolvedPropsTask,
    componentName,
    childClassLoadingName,
    childClassDataName,
    mutationComponents
  }).run().listen(
    defaultRunConfig({
      onResolved: ({childComponent, prePostMutationComparisons}) => {
        expect(childComponent.length).toEqual(1); // We found the child, meaning we loaded data and rendered
        testMutationChanges('component', updatedPaths, prePostMutationComparisons);
      }
    }, errors, done)
  );
};

/**
 * Tests rendering a component where Apollo query responses must be awaited.
 * We first check for the childClassLoadingName component to be loaded and then childClassDataOrErrorName,
 * which is either the data ready or error component, depending on which result we are expeciting
 * @param apolloClient
 * @param componentName
 * @param childClassLoadingName
 * @param childClassDataOrErrorName
 * @param container
 * @param component
 * @param props
 * @return {Task} A Task resolving to {wrapper, childComponent, component},
 * where wrapper is the mounted ApolloProvider->ReadAdopt->Containers->Component
 * and component is the Component within that stack. This result can be used to test mutations.
 * childComponent is the child of component that has the class name of childClassDataOrErrorName
 * @private
 */
const _testRenderComponent = ({apolloClient, componentName, childClassLoadingName, childClassDataOrErrorName}, container, component, props) => {

  // Create the React element from container, passing the props and component via a render function.
  // The react-adopt container expects to be given a render function so it can pass the results of the
  // Apollo request components
  const containerInstance = e(
    container,
    props,
    // These props contains the results of the Apollo queries and the mutation functions
    props => e(component, props)
  );
  // Wrap the componentInstance in mock Apollo providers.
  // If the componentInstance doesn't use Apollo it just means that it will render its children synchronously,
  // rather than asynchronously
  const wrapper = mountWithApolloClient(
    {apolloClient},
    containerInstance
  );
  // Find the top-level componentInstance. This is always rendered in any Apollo status (loading, error, store data)
  const componentInstance = wrapper.find(container);
  // Make sure the componentInstance props are consistent since the last test run
  expect(componentInstance.length).toEqual(1);

  // TODO act doesn't suppress the warning as it should
  // If we have an Apollo componentInstance, we use enzyme-wait to await the query to run and the the child
  // componentInstance that is dependent on the query result to render. If we don't have an Apollo componentInstance,
  // this child will be rendered immediately without delay
  let tsk = null;
  act(() => {
    // If we have an Apollo componentInstance, our immediate status after mounting the componentInstance is loading. Confirm
    if (childClassLoadingName) {
      expect(componentInstance.find(`.${getClass(childClassLoadingName)}`).length).toEqual(1);
    }
    tsk = waitForChildComponentRenderTask(wrapper, componentName, childClassDataOrErrorName);
  });
  return tsk.map(({wrapper, childComponent}) => {
    return {wrapper, childComponent, component: wrapper.find(componentName)};
  });
};

const _testRenderComponentMutations = ({mutationComponents, componentName, childClassDataName}, wrapper, component, props) => {
  // Store the state of the component's prop before the mutation
  const apolloRenderProps = component.props();
  return R.map(
    mutationResponseObjects => {
      return R.map(mutationResponseObject => {
        const {mutationName, mutationResponse, updatedComponent} = mutationResponseObject;
        return {
          mutationName,
          // Return the render props before and after the mutations so we can confirm that values changed
          preMutationApolloRenderProps: apolloRenderProps,
          postMutationApolloRenderProps: updatedComponent.instance().props,
          // This isn't really needed. It just shows the return value of the mutation
          mutationResponse
        };
      }, mutationResponseObjects);
    },
    waitAll(mapObjToValues(
      (mutationComponent, mutationName) => {
        // Create mutation variables by passing the props to the component and then accessing
        // it's variables prop, which is the result of the component's options.variables function
        // if defined
        const mutationVariables = createRequestVariables(
          mutationComponent,
          R.merge(
            {render: props => null},
            props
          )
        );
        // Get the mutate function that was returned in the props sent to the component's render function
        // This mutate function is what HOC passes via render to the component for each composed
        // mutation component
        const mutate = reqStrPathThrowing(mutationName, apolloRenderProps);
        // Call the mutate function, this will call the Apollo mutate function and give new results
        // to our component
        return composeWithChain([
            mapToNamedResponseAndInputs('updatedComponent',
              ({}) => of(wrapper.find(componentName))
            ),
            // Wait for render again--this might be immediate
            mapToNamedResponseAndInputs('childRendered',
              ({}) => waitForChildComponentRenderTask(wrapper, componentName, childClassDataName)
            ),
            // Call the mutate function
            mapToNamedResponseAndInputs('mutationResponse',
              () => fromPromised(() => {
                let m = null;
                // TODO act doesn't suppress the warning as it should
                act(() => {
                  m = mutate({variables: mutationVariables});
                });
                return m;
              })()
            )
          ]
        )({mutationName});
      },
      mutationComponents
    ))
  );
};

/**
 * Tests changes in the results of the same mutation run twice for each mutation in prePostMutationComparisons
 * We can tests things like updateDate in updatePaths that changes on each mutation
 * @param {String} clientOrComponent 'client' or 'component'. The key to use for each updatePaths object.
 * We use client if we're testing mutations with an ApolloClient. We use component if we're testing with an
 * Apollo Component
 * @param {Object} updatedPaths Keyed by mutation name, valued by an Object. We only care about the
 * client key of the Object, which are paths into the mutation response, such as updateMutation.
 * @param {[{Object}]} prePostMutationComparisons Array of objects in the form:
 * {mutationName, mutationResponse, preMutationApolloRenderProps, postMutationApolloRenderProps}
 * where the latter two are the result of calling the mutation once then again, or the before and after state of a single mutation
 */
const testMutationChanges = (clientOrComponent, updatedPaths, prePostMutationComparisons) => {
  // We should get a non-null mutation result for every mutationComponent
  R.forEach(
    prePostMutationComparisons => {
      const {mutationName, mutationResponse, preMutationApolloRenderProps, postMutationApolloRenderProps} = prePostMutationComparisons;
      // Make sure the mutation returned something
      expect(R.head(R.values(R.prop('data', mutationResponse)))).toBeTruthy();
      const updatedPathsForMutaton = R.propOr({client: []}, mutationName, updatedPaths)[clientOrComponent];
      if (updatedPathsForMutaton) {
        R.forEach(
          updatedPath => {
            expect(reqStrPathThrowing(updatedPath, preMutationApolloRenderProps)).not.toEqual(
              reqStrPathThrowing(updatedPath, postMutationApolloRenderProps)
            );
          },
          updatedPathsForMutaton
        );
      }
    },
    prePostMutationComparisons
  );
};

const _testRenderError = (
  {
    errorMaker,
    apolloConfigTask,
    resolvedPropsTask,
    componentName,
    childClassLoadingName,
    childClassErrorName,
    updatedPaths
  }, container, component, done) => {

  expect.assertions(
    3
  );

  const errors = [];
  return composeWithChain([
    // Render component, calling queries
    mapToMergedResponseAndInputs(
      ({apolloClient, componentName, childClassLoadingName, childClassErrorName, props}) => {
        return _testRenderComponent(
          {apolloClient, componentName, childClassLoadingName, childClassDataOrErrorName: childClassErrorName},
          container,
          component,
          props
        );
      }
    ),
    // Resolve the apolloConfigTask. This resolves to {schema, apolloClient}
    mapToMergedResponseAndInputs(
      ({apolloConfigTask}) => apolloConfigTask
    ),
    mapToNamedResponseAndInputs('props',
      ({resolvedPropsTask}) => R.map(
        props => errorMaker(props),
        resolvedPropsTask
      )
    )
  ])({
    apolloConfigTask,
    resolvedPropsTask,
    componentName,
    childClassLoadingName,
    childClassErrorName,
  }).run().listen(
    defaultRunConfig({
      onResolved: ({childComponent}) => {
        // Just make sure the error child component exists
        expect(childComponent.length).toEqual(1);
      }
    }, errors, done)
  );
};


/**
 * Given a Task to fetch parent container props and a task to fetch the current container props,
 * Fetches the parent props and then samplePropsTaskMaker with the  parent props
 * @param {Task<Result>} chainedParentPropsResultTask Task that resolves to the parent container props in a Result.Ok
 * @param {Function} samplePropsTaskMaker 2 arity function expecting parent props.
 * Returns a Task from a container that expects sampleOwnProps resolves to Result.Ok
 * @returns {Task} A Task to asynchronously return the parentContainer props merged with sampleOwnProps
 * in an Result.Ok. If anything goes wrong an Result.Error is returned
 */
export const propsFromParentPropsTask = v((chainedParentPropsResultTask, samplePropsTaskMaker) =>
    chainMDeep(2,
      // Chain the Result.Ok value to a Task combine the parent props with the props maker
      // Task Result.Ok -> Task Object
      parentContainerSampleProps => samplePropsTaskMaker(parentContainerSampleProps),
      chainedParentPropsResultTask
    ),
  [
    ['initialState', PropTypes.shape().isRequired],
    ['chainedParentPropsResultTask', PropTypes.shape().isRequired],
    ['samplePropsTaskMaker', PropTypes.func.isRequired]
  ],
  'propsFromParentPropsTask'
);


