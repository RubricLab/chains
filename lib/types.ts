import type { z } from 'zod/v4'
import type { $strict } from 'zod/v4/core'

/* --------- CORE --------- */

export type SupportedZodTypes = z.core.$ZodTypes

export type Node = {
	input: SupportedZodTypes
	output: SupportedZodTypes
}

export type CustomCompatibility = {
	type: SupportedZodTypes
	compatibilities: SupportedZodTypes[]
}

type ShapeOf<T extends SupportedZodTypes> = T extends z.core.$ZodString
	? 'string'
	: T extends z.core.$ZodNumber
		? 'number'
		: T extends z.core.$ZodBoolean
			? 'boolean'
			: T extends z.core.$ZodUndefined
				? 'undefined'
				: T extends z.core.$ZodNull
					? 'null'
					: T extends z.core.$ZodLiteral<infer Literal extends string>
						? Literal
						: T extends z.core.$ZodEnum<infer Enum extends Record<string, string>>
							? Enum[keyof Enum]
							: T extends z.core.$ZodObject<infer InnerShape extends Record<string, SupportedZodTypes>>
								? { [K in keyof InnerShape]: ShapeOf<InnerShape[K]> }
								: T extends z.core.$ZodArray<infer InnerShape extends SupportedZodTypes>
									? ShapeOf<InnerShape>[]
									: T extends z.core.$ZodUnion<infer Union extends readonly SupportedZodTypes[]>
										? ShapeOf<Union[number]>
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
	CustomCompatabilities extends CustomCompatibility[]
> = {
	[K in keyof Nodes]: IsCompatible<Nodes[K]['output'], Type> extends true
		? NodeDefinition<K & string, Nodes[K]['input'], Nodes, Strict, CustomCompatabilities>
		: never
}[keyof Nodes][]

type $InnerCompatibilities<
	Type extends SupportedZodTypes,
	Nodes extends Record<string, Node>,
	Strict extends boolean,
	CustomCompatabilities extends CustomCompatibility[]
> = Type extends z.ZodArray<infer Element extends SupportedZodTypes>
	? [z.ZodArray<Compatibilities<Element, Nodes, Strict, CustomCompatabilities>>]
	: Type extends z.ZodObject<infer Fields extends Record<string, SupportedZodTypes>>
		? [
				z.ZodObject<{
					[K in keyof Fields]: Compatibilities<Fields[K], Nodes, Strict, CustomCompatabilities>
				}>
			]
		: Type extends z.ZodUnion<infer Options extends readonly SupportedZodTypes[]>
			? [
					z.ZodUnion<{
						[I in keyof Options]: Compatibilities<Options[I], Nodes, Strict, CustomCompatabilities>
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
	AdditionalCompatabilities extends CustomCompatibility[]
> = z.ZodUnion<
	[
		...$InnerCompatibilities<Type, Nodes, Strict, AdditionalCompatabilities>,
		...$NodeCompatibilities<Type, Nodes, Strict, AdditionalCompatabilities>,
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
	AdditionalCompatabilities extends CustomCompatibility[]
> = z.ZodObject<
	{
		node: z.ZodLiteral<Name>
		input: Compatibilities<Input, Nodes, Strict, AdditionalCompatabilities>
	},
	$strict
>
