import { z } from 'zod/v4'

// SUPPORTED ZOD TYPES

type ZodTypes =
	| z.ZodObject<Record<string, ZodTypes>>
	| z.ZodArray<ZodTypes>
	| z.ZodString
	| z.ZodNumber
	| z.ZodBoolean
	| z.ZodUndefined
	| z.ZodVoid

type GenericNode = {
	input: Record<string, ZodTypes>
	output: ZodTypes
}

type ShapeOf<T extends ZodTypes> = T extends z.ZodString
	? 'string'
	: T extends z.ZodNumber
		? 'number'
		: T extends z.ZodBoolean
			? 'boolean'
			: T extends z.ZodUndefined
				? 'undefined'
				: T extends z.ZodVoid
					? 'void'
					: T extends z.ZodObject<infer InnerShape extends Record<string, ZodTypes>>
						? { [K in keyof InnerShape]: ShapeOf<InnerShape[K]> }
						: T extends z.ZodArray<infer InnerShape extends ZodTypes>
							? ShapeOf<InnerShape>[]
							: never

function shapeOf<Shape extends ZodTypes>(shape: Shape): ShapeOf<Shape> {
	switch (shape.def.type) {
		case 'object': {
			return Object.fromEntries(
				Object.entries(shape.def.shape).map(([key, value]) => {
					return [key, shapeOf(value)]
				})
			) as ShapeOf<Shape>
		}
		case 'array': {
			return [shapeOf(shape.def.element)] as ShapeOf<Shape>
		}
		case 'number': {
			return 'number' as ShapeOf<Shape>
		}
		case 'string': {
			return 'string' as ShapeOf<Shape>
		}
		case 'boolean': {
			return 'boolean' as ShapeOf<Shape>
		}
		case 'undefined': {
			return 'undefined' as ShapeOf<Shape>
		}
		case 'void': {
			return 'void' as ShapeOf<Shape>
		}
	}
}

function getShapes<Input extends Record<string, ZodTypes>>(input: Input) {
	return Object.fromEntries(
		Object.entries(input).map(([name, type]) => {
			return [name, shapeOf(type)]
		})
	) as { [K in keyof Input]: ReturnType<typeof shapeOf<Input[K]>> }
}

function compatableWith<
	Shape extends ReturnType<typeof shapeOf>,
	Nodes extends Record<string, GenericNode>
>({ shape, nodes }: { shape: Shape; nodes: Nodes }) {
	return Object.entries(nodes)
		.filter(([_, node]) => shapeOf(node.output) === shape)
		.map(([name, _]) => name) as {
		[K in keyof Nodes]: ReturnType<typeof shapeOf<Nodes[K]['output']>> extends Shape ? K : never
	}[keyof Nodes][]
}

function getCompatabilities<
	Shapes extends ReturnType<typeof getShapes>,
	Nodes extends Record<string, GenericNode>
>({ shapes, nodes }: { shapes: Shapes; nodes: Nodes }) {
	return Object.fromEntries(
		Object.entries(shapes).map(([name, shape]) => {
			return [name, { shape, compatabilities: compatableWith({ shape, nodes }) }]
		})
	) as {
		[K in keyof Shapes]: {
			shape: Shapes[K]
			compatabilities: ReturnType<typeof compatableWith<Shapes[K], Nodes>>
		}
	}
}

function createInputGetters<Inputs extends Record<string, ZodTypes>>(inputs: Inputs) {
	return Object.keys(inputs).map(name => [
		name,
		function collapse<Type extends ZodTypes>(type: Type) {
			return {
				get [name]() {
					return type
				}
			}
		}
	]) as {
		[K in keyof Inputs]: [K, <Type extends ZodTypes>(type: Type) => { [Key in K]: Type }]
	}[keyof Inputs][]
}

function createNodeDefinition<Name extends string, Node extends GenericNode>({
	name,
	node
}: { name: Name; node: Node }) {
	const innn = createInputGetters(node.input)

	return z.object({
		node: z.literal(name),
		input: z.object(Object.fromEntries(innn.map(([name, v]) => [name, v(z.string())])))
	})
}

const ij = createNodeDefinition({
	name: 'hi',
	node: { input: { name: z.string() }, output: z.undefined() }
})

const ttt: z.infer<typeof ij> = {
	node: 'hi',
	input: {
		name: 'uy'
	}
}

console.log(ij.parse(ttt))

export function createChain<Nodes extends Record<string, GenericNode>>({
	nodes
}: { nodes: Nodes }) {
	const shapesPerNode = Object.fromEntries(
		Object.entries(nodes).map(([name, node]) => {
			return [name, getShapes(node.input)]
		})
	) as { [K in keyof Nodes]: ReturnType<typeof getShapes<Nodes[K]['input']>> }

	const compatabilitiesPerNode = Object.fromEntries(
		Object.entries(shapesPerNode).map(([name, shapes]) => {
			return [name, getCompatabilities({ shapes, nodes })]
		})
	) as {
		[K in keyof typeof shapesPerNode]: ReturnType<
			typeof getCompatabilities<(typeof shapesPerNode)[K], Nodes>
		>
	}

	// return { compatabilities }

	return compatabilitiesPerNode
	// const newNodes = Object.fromEntries(
	// 	Object.entries(nodes).map(([name, node]) => {
	// 		return [
	// 			name,
	// 			{
	// 				get [name]() {
	// 					return node
	// 				}
	// 			}
	// 		]
	// 	})
	// ) as { [NodeKey in keyof Nodes]: { [_NodeKey in NodeKey]: Nodes[_NodeKey] } }

	// const distilled = Object.fromEntries(
	// 	Object.entries(newNodes).map(([name, node]) => {
	// 		return [name, node[name]]
	// 	})
	// ) as { [K in keyof Nodes]: { [K in keyof Nodes]: Nodes[K] }[keyof Nodes] }

	// const add = z.object({
	// 	node: z.literal('add'),
	// 	input: z.object({
	// 		get number1() {
	// 			return compatabilities['#number']
	// 		},
	// 		get number2() {
	// 			return compatabilities['#number']
	// 		}
	// 	})
	// })

	// const compatabilities = {
	// 	'#number': z.union([z.number(), add])
	// }

	// return {
	// 	nodes: { add },
	// 	compatabilities
	// }
}

const t = createChain({
	nodes: {
		add: {
			input: {
				number1: z.number(),
				number2: z.number()
			},
			output: z.number()
		},
		see: {
			input: {
				thing: z.array(z.string())
			},
			output: z.void()
		},
		stringify: {
			input: {
				number: z.number()
			},
			output: z.string()
		},
		log: {
			input: {
				string: z.string()
			},
			output: z.void()
		}
	}
})

// const { nodes } = createChain({ nodes: {} })

// const t: z.infer<typeof nodes.add> = {
// 	node: 'add',
// 	input: {
// 		number1: {
// 			node: 'add',
// 			input: {
// 				number1: {
// 					node: 'add',
// 					input: {
// 						number1: {
// 							node: 'add',
// 							input: {
// 								number1: 2,
// 								number2: 2
// 							}
// 						},
// 						number2: 2
// 					}
// 				},
// 				number2: 2
// 			}
// 		},
// 		number2: 2
// 	}
// }
