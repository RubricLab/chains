import { type Node, type Scope, shapeOf } from '@rubriclab/shapes'
import { type ZodType, z } from 'zod/v4'
import type { $ZodType, $ZodTypes } from 'zod/v4/core'
import type { NodeDefinition } from './types'

export function createChain<Nodes extends Record<string, Node>, Strict extends boolean>(
	nodes: Nodes,
	config?: { strict: Strict }
) {
	const strict = !!config?.strict

	const definitions: Record<string, ZodType> = {}
	const compatibilities: Record<string, ZodType> = {}

	function getDefinition(name: keyof Nodes & string, scope?: Scope) {
		return (
			definitions[scope ? `_Scoped(${scope.name},${name})` : name] ??
			createDefinition({
				name,
				...(scope ? { scope } : {})
			})
		)
	}

	function getCompatible(type: $ZodType, scope?: Scope): $ZodType {
		if (!compatibilities[shapeOf(type, scope)]) {
			walk(type, scope)
		}

		return compatibilities[shapeOf(type, scope)] ?? (undefined as never)
	}

	function createDefinition({ name, scope }: { name: keyof Nodes & string; scope?: Scope }) {
		definitions[scope ? `_Scoped(${scope.name},${name})` : name] =
			// biome-ignore assist/source/useSortedKeys: node first is more intuitive
			z.strictObject({
				node: z.literal(name),
				get input() {
					return getCompatible((nodes[name] ?? (undefined as never)).input, scope)
				}
			})

		// warm
		getCompatible((nodes[name] ?? (undefined as never)).input, scope)

		return definitions[scope ? `_Scoped(${scope.name},${name})` : name]
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
				return [z.array(getCompatible(def.element, scope))]
			}
			case 'object': {
				return [
					z.strictObject(
						Object.fromEntries(
							Object.entries(def.shape).map(([key, value]) => [key, getCompatible(value, scope)])
						)
					)
				]
			}
			case 'union': {
				return [z.union(def.options.map(option => getCompatible(option, scope)))]
			}

			case 'custom': {
				switch (def.extended.type) {
					case 'scoped': {
						return [getCompatible(def.extended.inner, def.extended.scope)]
					}
					default: {
						return []
					}
				}
			}

			default: {
				return []
			}
		}
	}

	function getSchema(type: $ZodType, scope?: Scope) {
		const _strict = type._zod.def.brand?.strict ?? strict
		const branches = [
			...getCompatibleDefinitions(type, scope),
			...getInnerCompatibilities(type, scope),
			...(scope ? getContextCompatibilities(type, scope) : []),
			...(_strict ? [] : [type])
		] as [$ZodType, ...$ZodType[]]

		if (branches.length === 0) {
			console.log('HERE!!', shapeOf(type, scope))
			return z.literal('BUG')
		}

		return z.union(branches)
	}

	function walk(type: $ZodType, scope?: Scope) {
		const def = (type as $ZodTypes)._zod.def

		compatibilities[shapeOf(type, scope)] = z.lazy(() => getSchema(type, scope))

		// warm
		getSchema(type, scope)

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
				break
			}
			case 'custom': {
				switch (def.extended.type) {
					case 'scoped': {
						walk(def.extended.inner, def.extended.scope)
						break
					}
				}
				break
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
			Object.keys(nodes).map(name => [name, createDefinition({ name })])
		) as unknown as {
			[K in keyof Nodes]: NodeDefinition<K & string, Nodes[K]['input'], Nodes, Strict>
		}
	}
}
