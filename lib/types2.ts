import type { z } from 'zod/v4'
import type { $strict } from 'zod/v4/core'

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export type SupportedZodPrimitives =
	| z.ZodString
	| z.ZodNumber
	| z.ZodBoolean
	| z.ZodUndefined
	| z.ZodNull
	| z.ZodLiteral<string>
	| z.ZodEnum<Record<string, string>>

export type SupportedZodTypes<Depth extends number = 10> = Depth extends 0
	? never
	:
			| SupportedZodPrimitives
			| z.ZodObject<Record<string, SupportedZodTypes<Prev[Depth]>>>
			| z.ZodArray<SupportedZodTypes<Prev[Depth]>>
			| z.ZodUnion<readonly SupportedZodTypes<Prev[Depth]>[]>

export type SupportedZodCompoundTypes = Exclude<SupportedZodTypes, SupportedZodPrimitives>

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

type IsCompatible<
	Out extends SupportedZodTypes,
	In extends SupportedZodTypes
> = ShapeOf<Out> extends ShapeOf<In> ? true : false

export type NodeCompatability<
	FieldType extends SupportedZodTypes,
	AllNodes extends Record<string, Node>,
	Strict extends boolean
> = {
	[K in keyof AllNodes]: IsCompatible<AllNodes[K]['output'], FieldType> extends true
		? NodeDefinition<K & string, AllNodes[K]['input'], AllNodes, Strict>
		: never
}[keyof AllNodes][]

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
				[K in keyof Input]: Strict extends true
					? z.ZodUnion<NodeCompatability<Input[K], Nodes, Strict>>
					: z.ZodUnion<[Input[K], ...NodeCompatability<Input[K], Nodes, Strict>]>
			},
			$strict
		>
	},
	$strict
>
