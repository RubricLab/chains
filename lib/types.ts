import type { z } from 'zod/v4'
import type { $strict } from 'zod/v4/core'

/* --------- CORE --------- */

type DepthMap = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

type Decrement<Depth extends number> = Depth extends keyof DepthMap ? DepthMap[Depth] : never

type MAX_DEPTH = 10

export type $SupportedZodTypes<Depth extends number> = Depth extends 0
	? never
	:
			| z.ZodString
			| z.ZodNumber
			| z.ZodBoolean
			| z.ZodUndefined
			| z.ZodNull
			| z.ZodLiteral<string>
			| z.ZodEnum<Record<string, string>>
			| z.ZodObject<Record<string, $SupportedZodTypes<Decrement<Depth>>>>
			| z.ZodArray<$SupportedZodTypes<Decrement<Depth>>>
			| z.ZodUnion<readonly $SupportedZodTypes<Decrement<Depth>>[]>

export type SupportedZodTypes = $SupportedZodTypes<MAX_DEPTH>

export type Node = {
	input: SupportedZodTypes
	output: SupportedZodTypes
}

export type CustomCompatibility = {
	type: SupportedZodTypes
	compatibilities: SupportedZodTypes[]
}

type ShapeOf<T extends SupportedZodTypes, Depth extends number = MAX_DEPTH> = Depth extends 0
	? never
	: T extends z.ZodString
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
									? { [K in keyof InnerShape]: ShapeOf<InnerShape[K], Decrement<Depth>> }
									: T extends z.ZodArray<infer InnerShape extends SupportedZodTypes>
										? ShapeOf<InnerShape, Decrement<Depth>>[]
										: T extends z.ZodUnion<infer Union extends readonly SupportedZodTypes[]>
											? ShapeOf<Union[number], Decrement<Depth>>
											: never

type IsCompatible<
	Out extends SupportedZodTypes,
	In extends SupportedZodTypes
> = ShapeOf<Out> extends ShapeOf<In> ? true : false

/* --------- COMPATABILITIES --------- */

type $NodeCompatibilities<
	Type extends SupportedZodTypes,
	Nodes extends Record<string, Node>,
	Strict extends boolean,
	CustomCompatabilities extends CustomCompatibility[],
	Depth extends number
> = {
	[K in keyof Nodes]: IsCompatible<Nodes[K]['output'], Type> extends true
		? NodeDefinition<
				K & string,
				Nodes[K]['input'],
				Nodes,
				Strict,
				CustomCompatabilities,
				Decrement<Depth>
			>
		: never
}[keyof Nodes][]

type $InnerCompatibilities<
	Type extends SupportedZodTypes,
	Nodes extends Record<string, Node>,
	Strict extends boolean,
	CustomCompatabilities extends CustomCompatibility[],
	Depth extends number
> = Depth extends 0
	? []
	: Type extends z.ZodArray<infer Element extends SupportedZodTypes>
		? [z.ZodArray<Compatibilities<Element, Nodes, Strict, CustomCompatabilities, Decrement<Depth>>>]
		: Type extends z.ZodObject<infer Fields extends Record<string, SupportedZodTypes>>
			? [
					z.ZodObject<{
						[K in keyof Fields]: Compatibilities<
							Fields[K],
							Nodes,
							Strict,
							CustomCompatabilities,
							Decrement<Depth>
						>
					}>
				]
			: Type extends z.ZodUnion<infer Options extends readonly SupportedZodTypes[]>
				? [
						z.ZodUnion<{
							[I in keyof Options]: Compatibilities<
								Options[I],
								Nodes,
								Strict,
								CustomCompatabilities,
								Decrement<Depth>
							>
						}>
					]
				: []

type $AdditionalCompatabilities<
	Type extends SupportedZodTypes,
	AdditionalCompatabilities extends CustomCompatibility[]
> = [
	AdditionalCompatabilities[number] extends infer AdditionalCompatability
		? AdditionalCompatability extends CustomCompatibility
			? IsCompatible<AdditionalCompatability['type'], Type> extends true
				? AdditionalCompatability['compatibilities'][number]
				: never
			: never
		: never
]

export type Compatibilities<
	Type extends SupportedZodTypes,
	Nodes extends Record<string, Node>,
	Strict extends boolean,
	AdditionalCompatabilities extends CustomCompatibility[],
	Depth extends number
> = z.ZodUnion<
	[
		...$InnerCompatibilities<Type, Nodes, Strict, AdditionalCompatabilities, Depth>,
		...$NodeCompatibilities<Type, Nodes, Strict, AdditionalCompatabilities, Depth>,
		...$AdditionalCompatabilities<Type, AdditionalCompatabilities>,
		...(Strict extends true ? [] : [Type])
	]
>

/* --------- MAIN CAST --------- */

export type NodeDefinition<
	Name extends string,
	Input extends SupportedZodTypes,
	Nodes extends Record<string, Node>,
	Strict extends boolean,
	AdditionalCompatabilities extends CustomCompatibility[],
	Depth extends number = MAX_DEPTH
> = z.ZodObject<
	{
		node: z.ZodLiteral<Name>
		input: Compatibilities<Input, Nodes, Strict, AdditionalCompatabilities, Depth>
	},
	$strict
>
