import { z } from 'zod/v4'
import type { $strict } from 'zod/v4/core'

type SupportedZodTypes =
	| z.ZodString
	| z.ZodNumber
	| z.ZodBoolean
	| z.ZodLiteral<string>
	| z.ZodUndefined
	| z.ZodVoid
	| z.ZodObject<Record<string, SupportedZodTypes>>
	| z.ZodArray<SupportedZodTypes>

type Node = {
	input: Record<string, SupportedZodTypes>
	output: SupportedZodTypes
}

type AdditionalCompatability = {
	type: SupportedZodTypes
	compatability: SupportedZodTypes
}

type ShapeOf<T extends SupportedZodTypes> = T extends z.ZodString
	? 'string'
	: T extends z.ZodNumber
		? 'number'
		: T extends z.ZodBoolean
			? 'boolean'
			: T extends z.ZodLiteral<infer Literal extends string>
				? Literal
				: T extends z.ZodUndefined
					? 'undefined'
					: T extends z.ZodVoid
						? 'void'
						: T extends z.ZodObject<infer InnerShape extends Record<string, SupportedZodTypes>>
							? { [K in keyof InnerShape]: ShapeOf<InnerShape[K]> }
							: T extends z.ZodArray<infer InnerShape extends SupportedZodTypes>
								? ShapeOf<InnerShape>[]
								: never

function shapeOf<Shape extends SupportedZodTypes>(shape: Shape): ShapeOf<SupportedZodTypes> {
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
		case 'literal': {
			return shape.def.values[0] as ShapeOf<Shape>
		}
		case 'undefined': {
			return 'undefined' as ShapeOf<Shape>
		}
		case 'void': {
			return 'void' as ShapeOf<Shape>
		}
	}
}

type Compatable<
	Type1 extends SupportedZodTypes,
	Type2 extends SupportedZodTypes
> = ShapeOf<Type1> extends ShapeOf<Type2> ? true : false

type NodeCompatability<
	Type extends SupportedZodTypes,
	Nodes extends Record<string, Node>,
	Strict extends boolean
> = {
	[K in keyof Nodes]: Compatable<Nodes[K]['output'], Type> extends true
		? NodeDefinition<K & string, Nodes[K]['input'], Nodes, Strict>
		: never
}[keyof Nodes][]

type NodeDefinition<
	Name extends string,
	Input extends Record<string, SupportedZodTypes>,
	Nodes extends Record<string, Node>,
	Strict extends boolean
> = z.ZodObject<
	{
		node: z.ZodLiteral<Name>
		input: z.ZodObject<
			{
				[K in keyof Input]: Strict extends true
					? z.ZodUnion<NodeCompatability<Input[K], Nodes, Strict>>
					: z.ZodUnion<[Input[K], ...NodeCompatability<Input[K], Nodes, Strict>]>
			},
			$strict
		>
	},
	$strict
>

type Definition<
	Name extends string = string,
	Input extends Record<string, SupportedZodTypes> = Record<string, SupportedZodTypes>,
	Nodes extends Record<string, Node> = Record<string, Node>,
	Strict extends boolean = boolean
> = {
	definition: NodeDefinition<Name, Input, Nodes, Strict>
	output: SupportedZodTypes
}

function getNodeCompatabilities<
	Type extends SupportedZodTypes,
	Definitions extends Record<string, Definition>
>({
	type,
	definitions,
	additionalCompatabilities = []
}: {
	type: Type
	definitions: Definitions
	additionalCompatabilities?: AdditionalCompatability[]
}) {
	const nodeCompatabilities = Object.values(definitions)
		.filter(({ output }) => {
			return JSON.stringify(shapeOf(output)) === JSON.stringify(shapeOf(type))
		})
		.map(({ definition }) => definition)

	const additionalSchemas = additionalCompatabilities
		.filter(({ type: additionalType }) => {
			return JSON.stringify(shapeOf(additionalType)) === JSON.stringify(shapeOf(type))
		})
		.map(({ compatability }) => compatability)

	return [...nodeCompatabilities, ...additionalSchemas]
}

export function createChain<Nodes extends Record<string, Node>, Strict extends boolean = false>(
	nodes: Nodes,
	{
		strict,
		additionalCompatabilities = []
	}: {
		strict: Strict
		additionalCompatabilities?: AdditionalCompatability[]
	} = {
		strict: false as Strict,
		additionalCompatabilities: []
	}
) {
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
		return z.object({
			node: z.literal(name),
			input: z.object(
				Object.defineProperties(
					{},
					Object.fromEntries(
						Object.keys(input).map(key => [
							key,
							{
								enumerable: true,
								configurable: false,
								get() {
									return compatabilities[name]?.[key]?.schema
								}
							}
						])
					)
				)
			)
		})
	}

	// Internal, recursive
	const definitions = Object.fromEntries(
		Object.entries(nodes).map(([name, node]) => [
			name,
			{
				definition: createNodeDefinition({ name, input: node.input }),
				output: node.output
			}
		])
	) as {
		[K in keyof Nodes]: Definition<K & string, Nodes[K]['input'], Nodes, Strict>
	}

	// Internal, recursive
	const compatabilities = Object.fromEntries(
		Object.entries(nodes).map(([name, node]) => {
			return [
				name,
				Object.fromEntries(
					Object.entries(node.input).map(([key, arg]) => {
						return [
							key,
							{
								shape: shapeOf(arg),
								schema: strict
									? z.union([
											...getNodeCompatabilities({ type: arg, definitions, additionalCompatabilities })
										])
									: z.union([
											arg,
											...getNodeCompatabilities({ type: arg, definitions, additionalCompatabilities })
										])
							}
						]
					})
				)
			]
		})
	) as {
		[K in keyof Nodes]: {
			[I in keyof Nodes[K]['input']]: {
				shape: ShapeOf<Nodes[K]['input'][I]>
				schema: Strict extends true
					? z.ZodUnion<NodeCompatability<Nodes[K]['input'][I], Nodes, Strict>>
					: z.ZodUnion<[Nodes[K]['input'][I], ...NodeCompatability<Nodes[K]['input'][I], Nodes, Strict>]>
			}
		}
	}

	type Definitions = typeof definitions

	type Compatabilities = typeof compatabilities

	const __definitions = Object.values(definitions).map(({ definition }) => definition) as {
		[K in keyof Definitions]: Definitions[K]['definition']
	}[keyof Definitions][]

	const __compatabilities = Object.values(compatabilities)
		.flatMap(Object.values)
		.reduce((acc, obj) => {
			if (
				!acc.some(
					(item: Compatabilities[keyof Compatabilities]) =>
						JSON.stringify(item.shape) === JSON.stringify(obj.shape)
				)
			) {
				acc.push(obj)
			}
			return acc
		}, []) as {
		[K in keyof Compatabilities]: {
			[J in keyof Compatabilities[K]]: {
				shape: Compatabilities[K][J]['shape']
				schema: Compatabilities[K][J]['schema']
			}
		}[keyof Compatabilities[K]]
	}[keyof Compatabilities][]

	async function drill<
		Payload extends z.infer<z.ZodUnion<typeof __definitions>>,
		NodeKey extends Payload['node'] extends keyof Nodes ? Payload['node'] : never
	>(
		payload: Payload,
		getExec: (
			key: NodeKey
		) => (
			node: z.infer<z.ZodObject<Nodes[NodeKey]['input'], $strict>>
		) => Promise<z.infer<Nodes[NodeKey]['output']>>
	) {
		const drilledInputs = Object.fromEntries(
			await Promise.all(
				Object.entries(payload.input).map(async ([key, arg]) => {
					if (arg instanceof Object && 'node' in arg) {
						return [key, await drill(arg, getExec)]
					}
					return [key, arg]
				})
			)
		) as z.infer<z.ZodObject<Nodes[NodeKey]['input'], $strict>>

		return (await getExec(payload.node as NodeKey)(drilledInputs)) as z.infer<
			Nodes[NodeKey]['output']
		>
	}

	return {
		definitions: __definitions,
		compatabilities: __compatabilities,
		drill
	}
}
