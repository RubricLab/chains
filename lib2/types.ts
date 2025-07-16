import type { ZodCustom, z } from 'zod/v4'
import type {
	$strict,
	$ZodArray,
	$ZodBoolean,
	$ZodEnum,
	$ZodLiteral,
	$ZodNull,
	$ZodNumber,
	$ZodObject,
	$ZodString,
	$ZodType,
	$ZodUndefined,
	$ZodUnion
} from 'zod/v4/core'

export type Node = {
	input: $ZodType
	output: $ZodType
}

export type Custom<Type, Token extends string> = ZodCustom<Type, Type> & {
	token: Token
}

export type Brand<Name extends string = string, Strict extends boolean = boolean> = {
	name: Name
	strict: Strict
}

export type Branded<Type extends $ZodType, Name extends string, Strict extends boolean> = Type &
	Brand<Name, Strict>

export type Token = `$$.${string}`

export type Scope<
	Name extends string = string,
	Context extends Record<Token, $ZodType> = Record<Token, $ZodType>
> = {
	name: Name
	context?: Context
}

export type Scoped<
	Type extends $ZodType,
	Name extends string,
	Context extends Record<Token, $ZodType>
> = Type & {
	scope: Scope<Name, Context>
}

export type ShapeOf<Type extends $ZodType> = Type extends Scoped<
	infer Inner extends $ZodType,
	infer Name,
	infer _Context
>
	? ['scoped', Name, ShapeOf<Inner>]
	: Type extends Branded<infer Inner extends $ZodType, infer Brand, infer _Strict>
		? ['branded', Brand, ShapeOf<Inner>]
		: Type extends $ZodString
			? 'string'
			: Type extends $ZodNumber
				? 'number'
				: Type extends $ZodBoolean
					? 'boolean'
					: Type extends $ZodUndefined
						? 'undefined'
						: Type extends $ZodNull
							? 'null'
							: Type extends $ZodLiteral<infer Literal extends string>
								? Literal
								: Type extends $ZodEnum<infer Enum extends Record<string, string>>
									? Enum[keyof Enum]
									: Type extends $ZodObject<infer Fields extends Record<string, $ZodType>>
										? { [Key in keyof Fields]: ShapeOf<Fields[Key]> }
										: Type extends $ZodArray<infer Inner extends $ZodType>
											? ShapeOf<Inner>[]
											: Type extends $ZodUnion<infer Union extends readonly $ZodType[]>
												? ShapeOf<Union[number]>
												: Type extends Custom<infer _, infer Token>
													? Token
													: never

export type IsCompatible<
	Out extends $ZodType,
	In extends $ZodType
> = ShapeOf<Out> extends ShapeOf<In> ? true : false

type $NodeCompatibilities<
	Type extends $ZodType,
	Nodes extends Record<string, Node>,
	Strict extends boolean,
	Context extends Record<string, $ZodType> | undefined
> = {
	[K in keyof Nodes]: IsCompatible<Nodes[K]['output'], Type> extends true
		? NodeDefinition<K & string, Nodes[K]['input'], Nodes, Strict, Context>
		: never
}[keyof Nodes][]

type $InnerCompatibilities<
	Type extends $ZodType,
	Nodes extends Record<string, Node>,
	Strict extends boolean,
	Context extends Record<string, $ZodType> | undefined
> = Type extends z.ZodArray<infer Element extends $ZodType>
	? [z.ZodArray<$Compatibilities<Element, Nodes, Strict, Context>>]
	: Type extends z.ZodObject<infer Fields extends Record<string, $ZodType>>
		? [
				z.ZodObject<{
					[K in keyof Fields]: Compatibilities<Fields[K], Nodes, Strict, Context>
				}>
			]
		: Type extends z.ZodUnion<infer Options extends readonly $ZodType[]>
			? [
					z.ZodUnion<{
						[I in keyof Options]: Compatibilities<Options[I], Nodes, Strict, Context>
					}>
				]
			: []

type $ContextCompatibilities<Type extends $ZodType, Context extends Record<string, $ZodType>> = [
	{
		[K in keyof Context]: ShapeOf<Context[K]> extends ShapeOf<Type> ? z.ZodLiteral<K & string> : never
	}[keyof Context][][number]
]

type $StrictCompatibilities<Type extends $ZodType, Strict extends boolean> = Type extends Branded<
	infer _Inner,
	infer _Name,
	infer StrictOverride
>
	? StrictOverride extends true
		? []
		: [Type]
	: Strict extends true
		? []
		: [Type]

export type $Compatibilities<
	Type extends $ZodType,
	Nodes extends Record<string, Node>,
	Strict extends boolean,
	Context extends Record<string, $ZodType> | undefined
> = Context extends Record<string, $ZodType>
	? z.ZodUnion<
			[
				...$ContextCompatibilities<Type, Context>,
				...$NodeCompatibilities<Type, Nodes, Strict, Context>,
				...$InnerCompatibilities<Type, Nodes, Strict, Context>,
				...$StrictCompatibilities<Type, Strict>
			]
		>
	: z.ZodUnion<
			[
				...$NodeCompatibilities<Type, Nodes, Strict, undefined>,
				...$InnerCompatibilities<Type, Nodes, Strict, undefined>,
				...$StrictCompatibilities<Type, Strict>
			]
		>

export type Compatibilities<
	Type extends $ZodType,
	Nodes extends Record<string, Node>,
	Strict extends boolean,
	Context extends Record<string, $ZodType> | undefined
> = Context extends Record<string, $ZodType>
	? $Compatibilities<Type, Nodes, Strict, Context>
	: Type extends Scoped<infer Inner, infer _Name, infer Context>
		? $Compatibilities<Inner, Nodes, Strict, Context>
		: $Compatibilities<Type, Nodes, Strict, undefined>

export type NodeDefinition<
	Name extends string,
	Input extends $ZodType,
	Nodes extends Record<string, Node>,
	Strict extends boolean,
	Context extends Record<string, $ZodType> | undefined = undefined
> = $ZodObject<
	{
		node: $ZodLiteral<Name>
		input: Compatibilities<Input, Nodes, Strict, Context>
	},
	$strict
>
