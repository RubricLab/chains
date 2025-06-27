import { z } from 'zod/v4'
import type {
	Definition,
	Node,
	NodeCompatability,
	ShapeOf,
	SupportedZodPrimitives,
	SupportedZodTypes
} from './types'

function shapeOf<Type extends SupportedZodTypes>(type: Type) {
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

function getCompatableNodes({
	shape,
	definitions
}: {
	shape: SupportedZodTypes
	definitions: {
		definition: z.ZodObject
		output: SupportedZodTypes
	}[]
}) {}

export function createChain<Nodes extends Record<string, Node>>(nodes: Nodes) {
	function createNodeDefinition<
		Name extends string,
		Input extends Record<string, SupportedZodTypes>
	>({
		name,
		input
	}: {
		name: Name
		input: Input
	}) {
		return z.strictObject({
			node: z.literal(name),
			get input() {
				return z.strictObject(
					Object.fromEntries(
						Object.entries(input).map(([key, shape]) => {
							const compatable = compatabilities[shapeOf(shape)]
							if (!compatable) {
								throw `No entry point for shape "${shapeOf(shape)}". Ensure there is a node that outputs "${shapeOf(shape)}" or disable "strict mode"`
							}
							return [key, compatable]
						})
					)
				)
			}
		})
	}

	const definitions = Object.fromEntries(
		Object.entries(nodes).map(([name, { input, output }]) => [
			name,
			{
				definition: createNodeDefinition({ name, input }),
				output
			}
		])
	)

	const compatabilities = {}

	const Shapes = new Map<string, string[]>()

	function upsertShape(shape: SupportedZodTypes, compatability: SupportedZodTypes) {
		const current = Shapes.get(shapeOf(shape))
		if (current) {
			if (!current.includes(shapeOf(compatability))) {
				Shapes.set(shapeOf(shape), [...current, shapeOf(compatability)])
			}
		} else {
			Shapes.set(shapeOf(shape), [shapeOf(compatability)])
		}
	}

	// function getCompatable({
	// 	shape,
	// 	definitions
	// }: {
	// 	shape: SupportedZodTypes
	// 	definitions: {
	// 		definition: ReturnType<typeof createNodeDefinition>
	// 		output: SupportedZodTypes
	// 	}[]
	// }) {
	// 	const compatable = definitions.filter(({ definition, output }) => {
	// 		if (shapeOf(shape) === shapeOf(output)) {

	// 		}
	// 	})
	// }

	// function getNestedCompatable({ shape, shapes })

	Object.entries(definitions).map(([key, { definition, output }]) => {
		upsertShape(output, definition)
	})


	Object.entries(nodes).map(([_, { input }]) => {
		Object.entries(input).map(([_, shape]) => {
			function drill<Shape extends SupportedZodTypes>(shape: Shape) {
				if (
					shape instanceof z.ZodArray ||
					shape instanceof z.ZodObject ||
					shape instanceof z.ZodUnion
				) {
					switch (shape.def.type) {
						case 'array': {
\							// z.array(drill(shape.def.element))
						}
						case 'object': {
							// z.object(
								Object.fromEntries(
									Object.entries(shape.def.shape).map(([key, shape]) => [key, drill(shape)])
								)
							
						}
						case 'union': {
							// z.union(shape.def.options.map(drill))
						}
					}
				} 
				return //
				
			}
			drill(shape)
		})
	})
}

// EVERY SHAPE, AN ARRAY OF COMPAT
