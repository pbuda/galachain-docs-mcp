import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { searchGalachainDocs } from './tools/search.js';
import { getGalachainClass } from './tools/get-class.js';
import { getGalachainMethod } from './tools/get-method.js';
import { listGalachainModules } from './tools/list-modules.js';

// Tool definitions
const tools = [
  {
    name: 'search_galachain_docs',
    description:
      'Search GalaChain SDK documentation for guides, API references, classes, and code examples. Use this to find information about GalaChain development.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: "Search query (e.g., 'token transfer', 'GalaContract decorator', 'authorization')"
        },
        package: {
          type: 'string',
          enum: ['chain-api', 'chain-client', 'chain-test', 'chaincode', 'chain-cli', 'guides', 'all'],
          default: 'all',
          description: 'Filter by package or documentation type'
        },
        type: {
          type: 'string',
          enum: ['all', 'guide', 'class', 'method', 'interface'],
          default: 'all',
          description: 'Filter by content type'
        },
        limit: {
          type: 'number',
          default: 5,
          description: 'Maximum results to return (1-20)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_galachain_class',
    description:
      'Get detailed API reference for a GalaChain class, interface, type, or enum. Returns full documentation including all methods, properties, and decorators.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description:
            "Class/interface name (e.g., 'GalaContract', 'TokenBalance', 'ChainCallDTO', 'TokenClass')"
        },
        package: {
          type: 'string',
          enum: ['chain-api', 'chain-client', 'chain-test', 'chaincode'],
          description: 'Optional: filter by specific package'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'get_galachain_method',
    description:
      'Get detailed information about a GalaChain method or function. Returns signature, parameters, return type, decorators, and examples.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        method_name: {
          type: 'string',
          description:
            "Method name, optionally with class prefix (e.g., 'submit', 'GalaContract.submit', 'createTokenClass')"
        },
        package: {
          type: 'string',
          enum: ['chain-api', 'chain-client', 'chain-test', 'chaincode'],
          description: 'Optional: filter by specific package'
        }
      },
      required: ['method_name']
    }
  },
  {
    name: 'list_galachain_modules',
    description:
      'List all available classes, interfaces, and types in GalaChain SDK packages. Useful for discovering what modules are available.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        package: {
          type: 'string',
          enum: ['chain-api', 'chain-client', 'chain-test', 'chaincode', 'all'],
          default: 'all',
          description: 'Filter by package'
        },
        type: {
          type: 'string',
          enum: ['class', 'interface', 'type', 'enum', 'function', 'all'],
          default: 'all',
          description: 'Filter by type'
        }
      }
    }
  }
];

interface ToolArgs {
  query?: string;
  name?: string;
  method_name?: string;
  package?: string;
  type?: string;
  limit?: number;
}

export function createServer() {
  const server = new Server({ name: 'galachain-docs', version: '1.0.0' }, { capabilities: { tools: {} } });

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'search_galachain_docs':
          return await searchGalachainDocs(args as ToolArgs & { query: string });
        case 'get_galachain_class':
          return await getGalachainClass(args as ToolArgs & { name: string });
        case 'get_galachain_method':
          return await getGalachainMethod(args as ToolArgs & { method_name: string });
        case 'list_galachain_modules':
          return await listGalachainModules(args as ToolArgs);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  });

  return server;
}
