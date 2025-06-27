import { z } from 'zod/v4'
import type {
	Definition,
	Node,
	NodeCompatability,
	ShapeOf,
	SupportedZodPrimitives,
	SupportedZodTypes
} from './types'

function shapeOf<Type extends SupportedZodTypes>(type: Type): ShapeOf<Type> {
	switch (type.def.type) {
		case 'string': {
			return 'string' as ShapeOf<Type>
		}
		case 'number': {
			return 'number' as ShapeOf<Type>
		}
		case 'boolean': {
			return 'boolean' as ShapeOf<Type>
		}
		case 'undefined': {
			return 'undefined' as ShapeOf<Type>
		}
		case 'null': {
			return 'null' as ShapeOf<Type>
		}
		case 'literal': {
			return `literal(${type.def.values[0]})` as ShapeOf<Type>
		}
		case 'enum': {
			return `enum(${Object.values(type.def.entries).join(',')})` as ShapeOf<Type>
		}
		case 'array': {
			return `array(${shapeOf(type.def.element)})` as ShapeOf<Type>
		}
		case 'object': {
			return `object(${Object.entries(type.def.shape)
				.map(([key, value]) => `${key}:${shapeOf(value)}`)
				.join(',')})` as ShapeOf<Type>
		}
		case 'union': {
			return `union(${type.def.options.map(option => shapeOf(option)).join(',')})` as ShapeOf<Type>
		}
	}
}

// function getInnerCompatabilities(type: Exclude<SupportedZodTypes, SupportedZodPrimitives>, definitions: Record<string, Definition>) {
// 	switch (type.def.type) {
// 		case 'array': {
// 			return z.array(getNodeCompatabilities({ type: type.def.element, definitions }))
// 		}
// 		case 'object': {
// 			return z.object(Object.fromEntries(Object.entries(type.def.shape).map(([key, value]) => [key, getNodeCompatabilities({ type: value, definitions })])))
// 		}
// 		case 'union': {
// 			return z.union(type.def.options.map(option => getNodeCompatabilities({ type: option, definitions })))
// 		}
// 	}
// }

function getNodeCompatabilities<
	Type extends SupportedZodTypes,
	Definitions extends Record<string, Definition>
>({
	type,
	definitions
}: {
	type: Type
	definitions: Definitions
}) {
	return Object.values(definitions)
		.filter(({ output }) => {
			return shapeOf(output) === shapeOf(type)
		})
		.map(({ definition }) => definition)
}

function createCompatabilityMap() {
	const compatabilityMap = new Map<ShapeOf<SupportedZodTypes>, z.ZodType[]>()

	return {
		compatabilityMap,
		upsertCompatability({ type, compatable }: { type: SupportedZodTypes; compatable: z.ZodType[] }) {
			const shape = shapeOf(type)
			const current = compatabilityMap.get(shape)

			if (current) {
				compatabilityMap.set(shape, [...compatable, ...current])
			} else {
				compatabilityMap.set(shape, compatable)
			}
		}
	}
}

function createNodeDefinition<
	Name extends string,
	Input extends Record<string, SupportedZodTypes>
>({
	name,
	input,
	compatabilityMap
}: {
	name: Name
	input: Input
	compatabilityMap: ReturnType<typeof createCompatabilityMap>['compatabilityMap']
}) {
	return z.object({
		node: z.literal(name),
		input: z.object(
			Object.defineProperties(
				{},
				Object.fromEntries(
					Object.entries(input).map(([key, shape]) => [
						key,
						{
							enumerable: true,
							configurable: false,
							get() {
								return z.union(compatabilityMap.get(shapeOf(shape)) || [])
							}
						}
					])
				)
			)
		)
	})
}

export function createChain<Nodes extends Record<string, Node>>(nodes: Nodes) {
	const { compatabilityMap, upsertCompatability } = createCompatabilityMap()

	const definitions = Object.fromEntries(
		Object.entries(nodes).map(([name, node]) => [
			name,
			{
				definition: createNodeDefinition({ name, input: node.input, compatabilityMap }),
				output: node.output
			}
		])
	) as {
		[K in keyof Nodes]: Definition<K & string, Nodes[K]['input'], Nodes>
	}

	// for (const [name, node] of Object.entries(nodes)) {
	// 	for (const [key, arg] of Object.entries(node.input)) {
	// 		const compatable = getNodeCompatabilities({ type: arg, definitions })
	// 		console.log(
	// 			name,
	// 			key,
	// 			compatable.map(c => shapeOf(c))
	// 		)
	// 		upsertCompatability({ type: arg, compatable })
	// 	}
	// }

	// const t: { shape: ShapeOf<SupportedZodTypes>; schema: z.ZodType }[] = []

	// compatabilityMap.forEach((schema, shape) => {
	// 	console.log(shape)
	// 	console.log(schema.map(s => s.def.type))
	// 	// console.log(shape)
	// 	// schema.map(s => {
	// 	// 	try {
	// 	// 		console.log(shapeOf(s))
	// 	// 	} catch (e) {
	// 	// 		console.log(e)
	// 	// 	}
	// 	// })
	// 	t.push({ shape, schema: z.union(schema) })
	// })

	return {
		definitions: Object.values(definitions).map(({ definition }) => definition),
		compatabilities: t
	}
}
