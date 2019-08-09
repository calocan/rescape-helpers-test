/**
 * Created by Andy Likuski on 2018.01.22
 * Copyright (c) 2018 Andy Likuski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * This is a minimized amount of graphql schema configuration for testing
 */


import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList
} from 'graphql';
import {addResolveFunctionsToSchema} from 'graphql-tools';
import {reqPathThrowing, findOneValueByParamsThrowing} from 'rescape-ramda';


const RegionType = new GraphQLObjectType({
  name: 'Region',
  fields: {
    id: {type: new GraphQLNonNull(GraphQLString)},
    name: {type: GraphQLString}
  }
});

// Fake Apollo Schema
const QueryType = new GraphQLObjectType({
  name: 'Query',
  fields: {
    regions: {
      type: new GraphQLList(RegionType),
      args: {
        id: {type: new GraphQLNonNull(GraphQLString)}
      }
    },
    region: {
      type: RegionType,
      args: {
        id: {type: new GraphQLNonNull(GraphQLString)}
      }
    }
  }
});

export const sampleConfig = {
  settings: {
    api: {
      // Used to test a server connection
      url: 'http://localhost:7000/api/graphql'
    }
  },
  regions: [
    {
      id: 'oakland',
      name: 'Oakland'
    }
  ]
};

/**
 * Minimum schema for testing
 * @type {GraphQLSchema}
 */
export const unresolvedLocalSchema = new GraphQLSchema({
  query: QueryType
});


// Mutates resolvedLocalSchema
export const addResolvers = schema => {
  // This function changes schema and doesn't return anything. Lame!
  addResolveFunctionsToSchema({
    schema: schema, resolvers: {
      Query: {
        regions: (parent, params, {options: {dataSource}}) => {
          return findOneValueByParamsThrowing(params, reqPathThrowing(['regions'], dataSource));
        }
      }
    }
  });
  return schema;
};


/**
 * This is our resolved schema created from the local schema above
 */
export const resolvedLocalSchema = addResolvers(unresolvedLocalSchema);