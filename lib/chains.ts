import { z } from 'zod/v4'
import type { CustomCompatibility, Node, NodeDefinition, SupportedZodTypes } from './types'

function shapeOf(schema: z.core.$ZodType): string {
	const def = (schema as SupportedZodTypes)._zod.def

	switch (def.type) {
		case 'string': {
			return '_string'
		}
		case 'number': {
			return '_number'
		}
		case 'boolean': {
			return '_boolean'
		}
		case 'undefined': {
			return '_undefined'
		}
		case 'null': {
			return '_null'
		}
		case 'literal': {
			return `_literal(${def.values[0]})`
		}
		case 'enum': {
			return `_enum(${Object.values(def.entries).join(',')})`
		}
		case 'array': {
			return `_array(${shapeOf(def.element)})`
		}
		case 'object': {
			return `_object(${Object.entries(def.shape)
				.map(([key, value]) => `${key}:${shapeOf(value)}`)
				.join(',')})`
		}
		case 'union': {
			return `_union(${def.options.map(option => shapeOf(option)).join(',')})`
		}
		default: {
			throw ''
		}
	}
}

export function createChain<
	Nodes extends Record<string, Node>,
	Strict extends boolean,
	AdditionalCompatibilities extends CustomCompatibility[]
>(
	nodes: Nodes,
	config?: {
		strict?: Strict
		additionalCompatibilities?: AdditionalCompatibilities
	}
) {
	const strict = config?.strict || false
	const additionalCompatibilities = config?.additionalCompatibilities || []

	/* --------- CREATE DEFINITIONS --------- */

	function createDefinition<Name extends string, Input extends SupportedZodTypes>({
		name,
		input
	}: {
		name: Name
		input: Input
	}) {
		// biome-ignore assist/source/useSortedKeys: node first is more intuitive
		return z.strictObject({
			// Make input lazy
			node: z.literal(name),
			get input() {
				return getCompatible(input)
			}
		})
	}

	const definitions = Object.fromEntries(
		Object.entries(nodes).map(([name, { input }]) => [name, createDefinition({ input, name })])
	) as {
		// All the typesafety happens here.
		[K in keyof Nodes]: NodeDefinition<
			K & string,
			Nodes[K]['input'],
			Nodes,
			Strict,
			AdditionalCompatibilities
		>
	}

	/* --------- COMPATIBILITIES --------- */

	const compatibilities: Record<string, z.ZodType> = {}

	function getCompatible<Type extends z.core.$ZodType>(type: Type) {
		return compatibilities[shapeOf(type)] ?? z.never()
	}

	function getAdditionalCompatibilities(type: z.core.$ZodType) {
		return (
			additionalCompatibilities.find(
				additionalCompatability => shapeOf(additionalCompatability.type) === shapeOf(type)
			)?.compatibilities || []
		)
	}

	function getCompatibleDefinitions(type: z.core.$ZodType) {
		return Object.entries(nodes)
			.filter(([_, { output }]) => shapeOf(output) === shapeOf(type))
			.map(([key]) => definitions[key])
	}

	function getInnerCompatabilities(type: z.core.$ZodType) {
		const {
			_zod: { def }
		} = type as z.core.$ZodTypes

		if (def.type === 'array') return [z.array(getCompatible(def.element))]
		if (def.type === 'object')
			return [
				z.strictObject(
					Object.fromEntries(
						Object.entries(def.shape).map(([key, field]) => [key, getCompatible(field)])
					)
				)
			]

		if (def.type === 'union') return [z.union(def.options.map(getCompatible))]
		return []
	}

	function getSchema(type: z.core.$ZodType) {
		const branches = [
			...getCompatibleDefinitions(type),
			...getInnerCompatabilities(type),
			...getAdditionalCompatibilities(type),
			...(strict ? [] : [type])
		] as [SupportedZodTypes, ...SupportedZodTypes[]]

		if (branches.length === 0) throw `No node produces shape "${shapeOf(type)}".`
		if (branches.length === 1) return branches[0]

		return z.union(branches)
	}

	/* --------- DISCOVER ALL TYPES --------- */

	function walk(type: z.core.$ZodType) {
		compatibilities[shapeOf(type)] = z.lazy(() => getSchema(type))

		if (type instanceof z.ZodArray) walk(type.def.element)
		if (type instanceof z.ZodObject) for (const field of Object.values(type.def.shape)) walk(field)
		if (type instanceof z.ZodUnion) for (const option of type.def.options) walk(option)
	}

	for (const { input, output } of Object.values(nodes)) {
		walk(input)
		walk(output)
	}

	return {
		compatibilities,
		definitions
	}
}
