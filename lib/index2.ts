import { createAction, createActionProxy } from '@rubriclab/actions'
import { createBlock, createBlockProxy } from '@rubriclab/blocks'
import { z } from 'zod/v4'
import type { $strict, $strip } from 'zod/v4/core'

type GenericNode<
	NameKey extends string,
	Name extends string,
	InputKey extends string,
	Input extends Record<string, z.ZodType>
> = {
	input: Input
	output: z.ZodType
	definition: z.ZodObject<
		Record<NameKey, z.ZodLiteral<Name>> & Record<InputKey, z.ZodObject<Input, $strip>>,
		$strip
	>
}

const t: GenericNode<'action', 'getName', 'params', { friendly: z.ZodBoolean }> = {
	input: {
		friendly: z.boolean()
	},
	output: z.string(),
	definition: z.object({
		action: z.literal('getName'),
		params: z.object({
			friendly: z.boolean()
		})
	})
}

type AnyNode = GenericNode<any, any, any, any>

export function createChain<Nodes extends Record<string, AnyNode>>({ nodes }: { nodes: Nodes }) {
	const add = {
		input: {
			action: z.literal('add'),
			params: z.object({ name: z.string() })
		},
		output: z.number()
	}

	return {
		nodes: {
			add
		},
		shapes: {
			number: {
				schema: z.number(),
				compatabilities: ['add'] as { [K in keyof Nodes]: K }[keyof Nodes][]
			}
		}
	}
}

const add = createAction({
	schema: {
		input: {
			number1: z.number(),
			number2: z.number()
		},
		output: z.number()
	},
	async execute({ number1, number2 }) {
		return number1 + number2
	}
})

const addDefinition = createActionProxy({
	name: 'add',
	input: add.schema.input
})

const ADD = {
	...add.schema,
	definition: addDefinition
}

const { nodes, shapes } = createChain({ nodes: { ADD } })

const blocks = Object.fromEntries(
	Object.entries(nodes).map(([name, { input }]) => [
		name,
		createBlockProxy({
			name,
			input
		})
	])
) as {
	[K in keyof typeof nodes]: ReturnType<typeof createBlockProxy<K, (typeof nodes)[K]['input']>>
}

Object.entries(shapes).map(([name, shape]) => {
	const compat = shape.compatabilities.map(compat => {
		return blocks[compat]
	})
	z.union([shape.schema])
})
