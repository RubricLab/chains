import z from 'zod/v4'

// SUPPORTED ZOD TYPES

type ZodTypes =
	| z.ZodObject<Record<string, ZodTypes>>
	| z.ZodArray<ZodTypes>
	| z.ZodString
	| z.ZodNumber
	| z.ZodBoolean

type GenericNode = {
	schema: {
		input: Record<string, ZodTypes>
		output: ZodTypes
	}
}

type GenericNodeMap = Record<string, GenericNode>

type ShapeOf<T extends ZodTypes> = T extends z.ZodString
	? 'string'
	: T extends z.ZodNumber
		? 'number'
		: T extends z.ZodBoolean
			? 'boolean'
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
	}
}

function isCompatible<Arg extends ZodTypes, Shape extends ZodTypes>({
	arg,
	shape
}: { arg: Arg; shape: Shape }) {
	const isCompatible = (shapeOf(arg) as unknown) === (shapeOf(shape) as unknown)
	return isCompatible as ShapeOf<Arg> extends ShapeOf<Shape> ? true : false
}

function getShapeCompatability<Nodes extends GenericNodeMap, Arg extends ZodTypes>({
	nodes,
	arg
}: { nodes: Nodes; arg: Arg }) {
	const compatableOutputs = Object.values(nodes).filter(node =>
		isCompatible({ arg, shape: node.schema.output })
	) as {
		[N in keyof Nodes]: ReturnType<
			typeof isCompatible<Arg, Nodes[N]['schema']['output']>
		> extends true
			? Nodes[N]
			: never
	}[keyof Nodes][]

	return compatableOutputs
}

function getInputCompatabilities<
	Nodes extends Record<string, GenericNode>,
	Node extends GenericNode
>({ nodes, node }: { nodes: Nodes; node: Node }) {
	const inputCompatabilities = Object.fromEntries(
		Object.entries(node.schema.input).map(([name, arg]) => {
			return [name, getShapeCompatability({ nodes, arg })]
		})
	) as {
		[N in keyof Node['schema']['input']]: ReturnType<
			typeof getShapeCompatability<Nodes, Node['schema']['input'][N]>
		>
	}

	return inputCompatabilities
}

function getInputShapes<Node extends GenericNode>({ node }: { node: Node }) {
	return Object.fromEntries(
		Object.entries(node.schema.input).map(([name, arg]) => {
			return [name, shapeOf(arg)]
		})
	) as {
		[N in keyof Node['schema']['input']]: ShapeOf<Node['schema']['input'][N]>
	}
}

function collapseInputShapes<Shapes extends Record<string, ShapeOf<ZodTypes>>>({
	shapes
}: { shapes: Shapes }) {
	return Object.fromEntries(
		Object.entries(shapes).map(([name, shape]) => {
			return [shape]
		})
	)
}

export function createChain<Nodes extends Record<string, GenericNode>>({
	nodes
}: { nodes: Nodes }) {
	const compatabilities = Object.entries(nodes).map(([name, node]) => {
		return [name, getInputCompatabilities({ nodes, node })] as const
	}) as {
		[N in keyof Nodes]: [N, ReturnType<typeof getInputCompatabilities<Nodes, Nodes[N]>>]
	}[keyof Nodes][]

	console.dir(compatabilities, { depth: null })

	// const types = Object.fromEntries(
	// 	compatabilities.map(([name, compatabilities]) => {
	// 		return [name, collapseInputShapes({ shapes: compatabilities })]
	// 	})
	// )

	// return {
	// 	nodes: [],
	// 	types: []
	// } as {
	// 	nodes: []
	// 	types: []
	// }

	// const union = compatabilities.map(([name, compatabilities]) => {
	// 	return z.object({
	// 		action: z.literal(name as string),
	// 		input: z.object(
	// 			Object.fromEntries(
	// 				Object.entries(compatabilities).map(([name, compatability]) => {
	// 					return [name, z.union(compatability)]
	// 				})
	// 			) as { [K in keyof typeof compatabilities]: z.ZodUnion<(typeof compatabilities)[K]> }
	// 		)
	// 	})
	// })

	// return union
}

const chain = createChain({
	nodes: {
		saveRecord: {
			schema: {
				input: {
					name: z.number(),
					age: z.number()
				},
				output: z.string()
			}
		},
		addNumbers: {
			schema: {
				input: {
					number1: z.number(),
					number2: z.number()
				},
				output: z.number()
			}
		},
		multiplyNumbers: {
			schema: {
				input: {
					number1: z.number(),
					number2: z.number()
				},
				output: z.number()
			}
		}
	}
})

// const ll: z.infer<typeof chain> = {
// 	action: 'addNumbers',
// 	input: {
// 		number1: 1,
// 		number2: 2
// 	}
// }

// console.log(schema)
