import type { z } from 'zod/v4'
import type { $strict } from 'zod/v4/core'

type DepthMap = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

type MAX_DEPTH = 10

type $SupportedZodTypes<Depth extends number = MAX_DEPTH> = Depth extends 0
	? never
	:
			| z.ZodString
			| z.ZodNumber
			| z.ZodBoolean
			| z.ZodUndefined
			| z.ZodNull
			| z.ZodLiteral<string>
			| z.ZodEnum<Record<string, string>>
			| z.ZodObject<Record<string, $SupportedZodTypes>>
			| z.ZodArray<$SupportedZodTypes>
			| z.ZodUnion<readonly $SupportedZodTypes<DepthMap[Depth]>[]>

export type SupportedZodTypes = $SupportedZodTypes

export type Node = {
	input: Record<string, SupportedZodTypes>
	output: SupportedZodTypes
}

export type AdditionalCompatability = {
	type: SupportedZodTypes
	compatibilities: SupportedZodTypes[]
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
									: T extends z.ZodUnion<infer Union extends readonly SupportedZodTypes[]>
										? ShapeOf<Union[number]>
										: never

type IsCompatible<
	Out extends SupportedZodTypes,
	In extends SupportedZodTypes
> = ShapeOf<Out> extends ShapeOf<In> ? true : false

export type Compatibilities<
	Type extends SupportedZodTypes,
	Nodes extends Record<string, Node>,
	Strict extends boolean
> = Strict extends true
	? z.ZodUnion<
			[...NodeCompatibilities<Type, Nodes, Strict>, ...InnerCompatibilities<Type, Nodes, Strict>]
		>
	: z.ZodUnion<
			[Type, ...NodeCompatibilities<Type, Nodes, Strict>, ...InnerCompatibilities<Type, Nodes, Strict>]
		>

export type NodeCompatibilities<
	Type extends SupportedZodTypes,
	Nodes extends Record<string, Node>,
	Strict extends boolean
> = {
	[K in keyof Nodes]: IsCompatible<Nodes[K]['output'], Type> extends true
		? NodeDefinition<K & string, Nodes[K]['input'], Nodes, Strict>
		: never
}[keyof Nodes][]

export type InnerCompatibilities<
	Type extends SupportedZodTypes,
	Nodes extends Record<string, Node>,
	Strict extends boolean
> = Type extends z.ZodArray<infer Element extends SupportedZodTypes>
	? [z.ZodArray<Compatibilities<Element, Nodes, Strict>>]
	: Type extends z.ZodObject<infer Fields extends Record<string, SupportedZodTypes>>
		? [z.ZodObject<{ [K in keyof Fields]: Compatibilities<Fields[K], Nodes, Strict> }>]
		: Type extends z.ZodUnion<infer Options extends readonly SupportedZodTypes[]>
			? [
					z.ZodUnion<{
						[I in keyof Options]: Compatibilities<Options[I], Nodes, Strict>
					}>
				]
			: []

export type NodeDefinition<
	Name extends string,
	Input extends Record<string, SupportedZodTypes>,
	Nodes extends Record<string, Node>,
	Strict extends boolean
> = z.ZodObject<
	{
		node: z.ZodLiteral<Name>
		input: z.ZodObject<
			{
				[K in keyof Input]: Compatibilities<Input[K], Nodes, Strict>
			},
			$strict
		>
	},
	$strict
>
