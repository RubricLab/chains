import type { Branded, Node, Scoped, ShapeOf } from '@rubriclab/shapes'
import type { ZodArray, ZodLiteral, ZodObject, ZodUnion } from 'zod/v4'
import type { $strict, $ZodLiteral, $ZodType } from 'zod/v4/core'

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
> = Type extends ZodArray<infer Element extends $ZodType>
	? [ZodArray<$Compatibilities<Element, Nodes, Strict, Context>>]
	: Type extends ZodObject<infer Fields extends Record<string, $ZodType>>
		? [
				ZodObject<{
					[K in keyof Fields]: Compatibilities<Fields[K], Nodes, Strict, Context>
				}>
			]
		: Type extends ZodUnion<infer Options extends readonly $ZodType[]>
			? [
					ZodUnion<{
						[I in keyof Options]: Compatibilities<Options[I], Nodes, Strict, Context>
					}>
				]
			: []

type $ContextCompatibilities<
	Type extends $ZodType,
	Context extends Record<string, $ZodType> | undefined
> = Context extends Record<string, $ZodType>
	? {
			[K in keyof Context]: ShapeOf<Context[K]> extends ShapeOf<Type> ? ZodLiteral<K & string> : never
		}[keyof Context][]
	: []

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
> = ZodUnion<
	[
		...$ContextCompatibilities<Type, Context>,
		...$NodeCompatibilities<Type, Nodes, Strict, Context>,
		...$InnerCompatibilities<Type, Nodes, Strict, Context>,
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
> = ZodObject<
	{
		node: $ZodLiteral<Name>
		input: Compatibilities<Input, Nodes, Strict, Context>
	},
	$strict
>
