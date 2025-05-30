import { z } from 'zod/v4'
import type { $strict } from 'zod/v4/core'

type SupportedZodTypes =
	| z.ZodString
	| z.ZodNumber
	| z.ZodBoolean
	| z.ZodUndefined
	| z.ZodVoid
	| z.ZodObject<Record<string, SupportedZodTypes>>
	| z.ZodArray<SupportedZodTypes>

type Node = {
	input: Record<string, SupportedZodTypes>
	output: SupportedZodTypes
}

type ShapeOf<T extends SupportedZodTypes> = T extends z.ZodString
	? 'string'
	: T extends z.ZodNumber
		? 'number'
		: T extends z.ZodBoolean
			? 'boolean'
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

type NodeCompatability<Type extends SupportedZodTypes, Nodes extends Record<string, Node>> = {
	[K in keyof Nodes]: Compatable<Nodes[K]['output'], Type> extends true
		? NodeDefinition<K & string, Nodes[K]['input'], Nodes>
		: never
}[keyof Nodes][]

type NodeDefinition<
	Name extends string,
	Input extends Record<string, SupportedZodTypes>,
	Nodes extends Record<string, Node>
> = z.ZodObject<
	{
		node: z.ZodLiteral<Name>
		input: z.ZodObject<
			{ [K in keyof Input]: z.ZodUnion<NodeCompatability<Input[K], Nodes>> },
			$strict
		>
	},
	$strict
>

type Definition<
	Name extends string = string,
	Input extends Record<string, SupportedZodTypes> = Record<string, SupportedZodTypes>,
	Nodes extends Record<string, Node> = Record<string, Node>
> = {
	definition: NodeDefinition<Name, Input, Nodes>
	output: SupportedZodTypes
}

function getNodeCompatabilities<
	Type extends SupportedZodTypes,
	Definitions extends Record<string, Definition>
>({ type, definitions }: { type: Type; definitions: Definitions }) {
	return Object.values(definitions)
		.filter(({ output }) => {
			return JSON.stringify(shapeOf(output)) === JSON.stringify(shapeOf(type))
		})
		.map(({ definition }) => definition)
}

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
									return compatabilities[name]?.[key]?.zod
								}
							}
						])
					)
				)
			)
		})
	}

	const definitions = Object.fromEntries(
		Object.entries(nodes).map(([name, node]) => [
			name,
			{
				definition: createNodeDefinition({ name, input: node.input }),
				output: node.output
			}
		])
	) as {
		[K in keyof Nodes]: Definition<K & string, Nodes[K]['input'], Nodes>
	}

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
								zod: z.union([...getNodeCompatabilities({ type: arg, definitions })])
							}
						]
					})
				)
			]
		})
	)

	return {
		definitions: Object.values(definitions).map(({ definition }) => definition) as {
			[K in keyof typeof definitions]: (typeof definitions)[K]['definition']
		}[keyof typeof definitions][],
		compatabilities
	}
}
