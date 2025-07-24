import { type Node, type Scope, shapeOf } from '@rubriclab/shapes'
import { type ZodType, z } from 'zod/v4'
import type { $ZodType, $ZodTypes } from 'zod/v4/core'
import type { NodeDefinition } from './types'

function resolve(t: $ZodType): $ZodType {
	const def = (t as $ZodTypes)._zod.def
	switch (def.type) {
		case 'lazy': {
			return resolve(def.getter())
		}
		default: {
			return t
		}
	}
}

function isNever(t: $ZodType): boolean {
	return (resolve(t) as $ZodTypes)._zod.def.type === 'never'
}
export function createChain<Nodes extends Record<string, Node>, Strict extends boolean>(
	nodes: Nodes,
	config?: { strict: Strict }
) {
	const strict = !!config?.strict

	const definitions: Record<string, ZodType> = {}
	const compatibilities: Record<string, ZodType> = {}

	function getDefinition(name: keyof Nodes & string, scope?: Scope) {
		return (
			definitions[scope ? `scoped(${scope.name},${name})` : name] ??
			createDefinition({
				name,
				...(scope ? { scope } : {})
			})
		)
	}

	function getCompatible(type: $ZodType, scope?: Scope): $ZodType {
		return compatibilities[shapeOf(type, scope)] ?? (undefined as never)
	}

	function createDefinition({ name, scope }: { name: keyof Nodes & string; scope?: Scope }) {
		const input = getCompatible((nodes[name] ?? (undefined as never)).input, scope)
		const key = scope ? `scoped(${scope.name},${name})` : name
		if (isNever(input)) {
			console.warn('No entry for definition: ', key)
			return undefined
		}
		definitions[key] =
			// biome-ignore assist/source/useSortedKeys: node first is more intuitive
			z.strictObject({
				node: z.literal(name),
				input
			})

		return definitions[key]
	}

	function getCompatibleDefinitions(type: $ZodType, scope?: Scope) {
		return Object.entries(nodes)
			.filter(([_, { output }]) => shapeOf(output, scope) === shapeOf(type, scope))
			.map(([key]) => getDefinition(key, scope))
	}

	function getContextCompatibilities(type: $ZodType, scope: Scope) {
		return Object.entries(scope.context ?? {})
			.filter(([, tokenType]) => shapeOf(tokenType, scope) === shapeOf(type, scope))
			.map(([token]) => z.literal(token))
	}

	function getInnerCompatibilities(type: $ZodType, scope?: Scope) {
		const def = (type as $ZodTypes)._zod.def
		switch (def.type) {
			case 'array': {
				const compat = getCompatible(def.element, scope)

				return isNever(compat) ? [] : [z.array(getCompatible(def.element, scope))]
			}
			case 'object': {
				const fields = Object.entries(def.shape).map(
					([key, value]) => [key, getCompatible(value, scope)] as const
				)
				return fields.find(field => isNever(field[1]))
					? []
					: [z.strictObject(Object.fromEntries(fields))]
			}
			case 'union': {
				const options = def.options
					.map(option => getCompatible(option, scope))
					.filter(option => !isNever(option))

				return options.length ? [z.union(options)] : []
			}
			default: {
				return []
			}
		}
	}

	function getSchema(type: $ZodType, scope?: Scope) {
		const _strict = type._zod.def.brand?.strict ?? strict
		const branches = (
			[
				...getCompatibleDefinitions(type, scope),
				...getInnerCompatibilities(type, scope),
				...(scope ? getContextCompatibilities(type, scope) : []),
				...(_strict ? [] : [type])
			] as [$ZodType, ...$ZodType[]]
		).filter(branch => !isNever(branch))

		if (branches.length === 0) {
			console.warn('No compatibilities found for shape: ', shapeOf(type, scope))
			return z.never()
		}

		return z.union(branches)
	}

	function walk(type: $ZodType, _scope?: Scope) {
		const def = (type as $ZodTypes)._zod.def
		const scope = _scope ?? def.scope

		compatibilities[shapeOf(type, scope)] = z.lazy(() => getSchema(type, scope))

		switch (def.type) {
			case 'array': {
				walk(def.element, scope)
				break
			}
			case 'object': {
				for (const field of Object.values(def.shape)) walk(field, scope)
				break
			}
			case 'union': {
				for (const option of def.options) walk(option, scope)
			}
		}
	}

	for (const { input, output } of Object.values(nodes)) {
		walk(input)
		walk(output)
	}

	return {
		compatibilities,
		definitions: Object.fromEntries(
			Object.keys(nodes)
				.map(name => [name, createDefinition({ name })])
				.filter(([, def]) => def !== undefined)
		) as unknown as {
			[K in keyof Nodes]: NodeDefinition<K & string, Nodes[K]['input'], Nodes, Strict>
		}
	}
}
