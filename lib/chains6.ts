import { z } from 'zod/v4'
import type { Node, SupportedZodTypes } from './types'

function shapeOf<Type extends SupportedZodTypes>(type: Type): string {
	switch (type.def.type) {
		case 'string': {
			return 'string'
		}
		case 'number': {
			return 'number'
		}
		case 'boolean': {
			return 'boolean'
		}
		case 'undefined': {
			return 'undefined'
		}
		case 'null': {
			return 'null'
		}
		case 'literal': {
			return `literal(${type.def.values[0]})`
		}
		case 'enum': {
			return `enum(${Object.values(type.def.entries).join(',')})`
		}
		case 'array': {
			return `array(${shapeOf(type.def.element)})`
		}
		case 'object': {
			return `object(${Object.entries(type.def.shape)
				.map(([key, value]) => `${key}:${shapeOf(value)}`)
				.join(',')})`
		}
		case 'union': {
			return `union(${type.def.options.map(option => shapeOf(option)).join(',')})`
		}
	}
}

export function createChain<Nodes extends Record<string, Node>>(nodes: Nodes) {
	const shapeCache = new Map<string, SupportedZodTypes>()
	const producedBy: Record<string, ReturnType<typeof def>[]> = {}

	function recordShape(s: SupportedZodTypes) {
		const k = shapeOf(s)
		if (!shapeCache.has(k)) shapeCache.set(k, s)
	}

	function walk(t: SupportedZodTypes): void {
		recordShape(t)

		if (t instanceof z.ZodArray) walk(t.def.element)
		if (t instanceof z.ZodObject) Object.values(t.def.shape).forEach(walk)
		if (t instanceof z.ZodUnion) t.def.options.forEach(walk)
	}

	function def<Name extends string, In extends Record<string, SupportedZodTypes>>(opts: {
		name: Name
		input: In
	}) {
		return z.strictObject({
			node: z.literal(opts.name),
			get input() {
				return z.strictObject(
					Object.fromEntries(
						Object.entries(opts.input).map(([k, s]) => {
							const c = compat(s)
							if (!c) throw `No entry point for shape “${shapeOf(s)}”`
							return [k, c]
						})
					)
				)
			}
		})
	}

	const definitions = Object.fromEntries(
		Object.entries(nodes).map(([name, { input, output }]) => {
			const definition = def({ name, input })

			walk(output)
			Object.values(input).forEach(walk)

			const k = shapeOf(output)
			producedBy[k] = producedBy[k] ?? []
			producedBy[k].push(definition)

			return [name, definition]
		})
	)

	const compatibilities: Record<string, z.ZodTypeAny> = {}
	const schemaCache: Record<string, z.ZodTypeAny> = {}

	function compat(kOrShape: string | SupportedZodTypes): z.ZodTypeAny {
		const k = typeof kOrShape === 'string' ? kOrShape : shapeOf(kOrShape)
		return compatibilities[k] ?? z.lazy(() => schemaFor(k))
	}

	function schemaFor(k: string): z.ZodTypeAny {
		if (schemaCache[k]) return schemaCache[k]

		const branches: z.ZodTypeAny[] = producedBy[k] ?? []
		const t = shapeCache.get(k)

		if (t instanceof z.ZodArray) {
			branches.push(z.array(compat(t.def.element)))
		} else if (t instanceof z.ZodObject) {
			const objShape = Object.fromEntries(
				Object.entries(t.def.shape).map(([prop, sub]) => [prop, compat(sub)])
			)
			branches.push(z.strictObject(objShape))
		} else if (t instanceof z.ZodUnion) {
			branches.push(z.union(t.def.options.map(o => compat(o))))
		}

		const s = branches.length === 1 ? branches[0] : z.union(branches)
		if (!s) {
			throw 'ERROR'
		}
		schemaCache[k] = s
		return s
	}

	shapeCache.forEach((_, key) => {
		compatibilities[key] = z.lazy(() => schemaFor(key))
	})

	// for (const k of shapeCache.keys()) {
	// 	compatibilities[k] = z.lazy(() => schemaFor(k))
	// }

	return {
		definitions,
		compatibilities
	}
}

// const test = createChain({
// 	add: {
// 		input: {
// 			number1: z.number(),
// 			number2: z.number()
// 		},
// 		output: z.number()
// 	},
// 	subtract: {
// 		input: {
// 			number1: z.number(),
// 			number2: z.number()
// 		},
// 		output: z.number()
// 	},
// 	stringify: {
// 		input: {
// 			number: z.number()
// 		},
// 		output: z.string()
// 	},
// 	concatenate: {
// 		input: {
// 			strings: z.array(z.string())
// 		},
// 		output: z.string()
// 	},
// 	split: {
// 		input: {
// 			string: z.string()
// 		},
// 		output: z.array(z.string())
// 	},
// 	parseInt: {
// 		input: {
// 			string: z.string()
// 		},
// 		output: z.number()
// 	},
// 	log: {
// 		input: {
// 			text: z.object({
// 				value: z.union([z.string(), z.number()]),
// 				thing: z.union([z.string(), z.number()])
// 			})
// 		},
// 		output: z.undefined()
// 	}
// })

// const registry = z.registry<{ id: string }>()

// Object.values(test.definitions).map(d => {
// 	d.definition.register(registry, { id: d.definition.def.shape.node.def.values[0] })
// })

// Object.entries(test.compatibilities).map(([k, v]) => {
// 	v.register(registry, { id: k })
// })

// console.dir(
// 	z.toJSONSchema(z.union(Object.values(test.definitions).map(({ definition }) => definition)), {
// 		metadata: registry
// 	}),
// 	{
// 		depth: null
// 	}
// )
