import type { z } from 'zod/v4'
import type { $strict } from 'zod/v4/core'

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

export type SupportedZodTypes<Depth extends number = 20> = Depth extends 0
	? never
	:
			| z.ZodString
			| z.ZodNumber
			| z.ZodBoolean
			| z.ZodUndefined
			| z.ZodNull
			| z.ZodLiteral<string>
			| z.ZodEnum<Record<string, string>>
			| z.ZodObject<Record<string, SupportedZodTypes<Prev[Depth]>>>
			| z.ZodArray<SupportedZodTypes<Prev[Depth]>>
			| z.ZodUnion<readonly SupportedZodTypes<Prev[Depth]>[]>

export type Node = {
	input: Record<string, SupportedZodTypes>
	output: SupportedZodTypes
}

export type ShapeOf<T extends SupportedZodTypes> = T extends z.ZodString
	? 'string'
	: T extends z.ZodNumber
		? 'number'
		: T extends z.ZodBoolean
			? 'boolean'
			: T extends z.ZodUndefined
				? 'undefined'
				: T extends z.ZodNull
					? 'null'
					: T extends z.ZodLiteral<infer Literal extends string>
						? Literal
						: T extends z.ZodEnum<infer Enum extends Record<string, string>>
							? Enum[keyof Enum]
							: T extends z.ZodObject<infer InnerShape extends Record<string, SupportedZodTypes>>
								? { [K in keyof InnerShape]: ShapeOf<InnerShape[K]> }
								: T extends z.ZodArray<infer InnerShape extends SupportedZodTypes>
									? ShapeOf<InnerShape>[]
									: T extends z.ZodUnion<infer Union extends SupportedZodTypes[]>
										? ShapeOf<Union[number]>
										: never

type Compatable<
	Type1 extends SupportedZodTypes,
	Type2 extends SupportedZodTypes
> = ShapeOf<Type1> extends ShapeOf<Type2> ? true : false

export type NodeCompatability<
	Type extends SupportedZodTypes,
	Nodes extends Record<string, Node>
> = {
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
			{
				[K in keyof Input]: z.ZodUnion<NodeCompatability<Input[K], Nodes>>
			},
			$strict
		>
	},
	$strict
>

export type Definition<
	Name extends string = string,
	Input extends Record<string, SupportedZodTypes> = Record<string, SupportedZodTypes>,
	Nodes extends Record<string, Node> = Record<string, Node>
> = {
	definition: NodeDefinition<Name, Input, Nodes>
	output: SupportedZodTypes
}
