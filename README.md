# @rubriclab/chains

A framework for creating recursive schemas from input/output definitions.
Designed for complex structured output use cases with LLMs, runtime parsing of recursive objects, and compile time safety.

## Get Started
### Installation
`bun add @rubriclab/chains`

> @rubriclab scope packages are not built, they are all raw typescript. If using in a next.js app, make sure to transpile.

```ts
// next.config.ts
import type { NextConfig } from  'next' 
export default {
	transpilePackages: ['@rubriclab/chains'],
	reactStrictMode: true
} satisfies  NextConfig
```

> If using inside the monorepo (@rubric), simply add `{"@rubriclab/chains": "*"}` to dependencies and then run `bun i`

## Quick Start

### Define some nodes
Nodes are input/output pairs. A similar schema is used in @rubriclab/actions, @rubriclab/blocks, and for tools in @rubriclab/agents.

Inputs are `Record<string, z.ZodType>`
Outputs are `z.ZodType`

> Note, only a subset of zod types are currently supported.
> ```ts
> type SupportedZodTypes =
> 	| z.ZodString
> 	| z.ZodNumber
> 	| z.ZodBoolean
> 	| z.ZodLiteral<string>
> 	| z.ZodUndefined
> 	| z.ZodVoid
> 	| z.ZodObject<Record<string, SupportedZodTypes>>
> 	| z.ZodArray<SupportedZodTypes>
> ```

```ts
import { z } from 'zod/v4'

const stringify = {
    input: {
        number: z.number()
    },
    output: z.string()
}

const numberify = {
    input: {
        number: z.string()
    },
    output: z.number()
}

export const nodes = { stringify, numberify }
```

### Create a chain

```ts
import { createChain } from '@rubriclab/chains'

const { definitions, compatabilities, drill, __Chain } = createChain(nodes)

export { definitions, compatabilities, drill }

export type Chain = typeof __Chain
```

### Create an executor
```ts
export async function executeChain(chain: Chain) {
	return drill(chain, key => {
		return async input => {
			switch (key) {
				case 'stringify':
					return input.number.toString()
				case 'numberify':
					return Number(input.string)
			}
		}
	})
}
```

### execute a chain
```ts
const chain: Chain = {
	node: 'stringify',
	input: {
		number: {
			node: 'numberify',
			input: {
				string: '3'
			}
		}
	}
}

const output = await executeChain(chain)
```

## Usage with Structured Outputs
The chains package returns definitions which are designed to make it easy to create response formats with fully featured recursion.

> Zod 4 offers a new registry feature - which allows you to add metadata to types. This feature can be used with the new z.toJSONSchema feature to extract types to $defs, which allows us to do recursion within response format. This is the core unlock.
> [Zod Source](https://zod.dev/json-schema?id=configuration)
> [Open AI Source](https://platform.openai.com/docs/guides/structured-outputs#recursive-schemas-are-supported)

### Create a registry, and register definitions and compatabilities from your chain

```ts

import { compatabilities, definitions } from './chains'

const chainRegistry = z.registry<{ id: string }>()

// Register definitions
for (const definition of definitions) {
	definition.register(chainRegistry, { id: definition.shape.node.value })
}

// Register compatabilities
for (const { shape, schema } of compatabilities) {
	schema.register(chainRegistry, { id: JSON.stringify(shape) })
}
```

### Create a response format
Use the response format creation util from @rubriclab/agents

```ts
import { createResponseFormat } from '@rubriclab/agents'

const responseFormat = createResponseFormat({
	name: 'chain',
	schema: z.object({
		chain: z.union(definitions)
	}),
	// Pass the registry to build the recursive schema.
	registry: chainRegistry
})

console.dir(responseFormat, { depth: null }) // check it out!
```

You can use the response format with the agents package, or pass it directly to OpenAI.


## Advanced Options

### Strict Mode
By default, strict mode is off, this means that the raw types are valid entry points for a chain.
```ts
createChain({
    add: {
        input: {
            a: z.number(),
            b: z.number()
        },
        output: z.number()
    }
}, {
	strict: false,
})

const valid = {
    node: 'add',
    input: {
        a: {
            node: 'add',
            input: {
                a: 1,
                b: 2
            }
        },
        b: 3
    }
}
```
With strict mode ON, the raw types are only used for compatabilities, you can't actually pass them. In the above case, the only valid chain would be infinite:

```ts
const valid = {
    node: 'add',
    input: {
        a: {
            node: 'add',
            input: {
                a: {
                    node: 'add',
                    input: {
                        a: {
                            node: 'add'
...
```

This is useful in many LLM structured output cases, to prevent the model from hallucinating raw inputs, but you have to make sure that you have a valid entry point for each type.

```ts
createChain({
    add: {
        input: {
            a: z.number(),
            b: z.number()
        },
        output: z.number()
    },
    numberInput: {
        input: {},
        output: z.number()
    }
}, {
	strict: true,
})

const valid = {
    node: 'add',
    input: {
        a: {
            node: 'numberInput', // ex. a UI element
            input: {}
        },
        b: {
            node: 'numberInput',
            input: {}
        }
    }
}
```

### Additional Compatabilities
Sometimes, you need to push an additional compatability to the chain outside of the normal I/O chaining flow.

```ts

createChain({
    pingUser: {
        input: {
            userId: z.uuid()
        },
        output: z.undefined()
    }
}, {
	additionalCompatabilities: [
		{ type: z.uuid(), compatability: z.literal('$.USER_ID') },
	]
})
```

```ts
const valid = {
    node: 'pingUser',
    input: {
        userId: '$.USER_ID'
    }
}
```

This might useful for context injection, for example, keeping sensitive values out of system prompts (and avoiding hallucinations)

It can also be combined with Strict mode to 'override' hard coded 

```ts

// Crete a slot to allow the LLM to put any string here
const inputString = z.literal('input_string')

createChain({
    getAccessToken: {
        input: {},
        output: z.string()
    },
    log: {
        input: {
            accessToken: z.string(),
            message: inputString
        }
    }
}, {
    strict: true // Set true
	additionalCompatabilities: [
        // allow a raw string.
		{ type: inputString, compatability: z.string() },
	]
})
```

```ts
const valid = {
    node: 'log',
    input: {
        accessToken: {
            node: 'getAccessToken',
            input: {}
        },
        message: 'YOOOOOOO WHATS UP!!!'
    }
}

const invalid = {
    node: 'log',
    input: {
        accessToken: 'Hallucination',
        message: '...'
    }
}
```

