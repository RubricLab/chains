import { z } from 'zod/v4'
import type {
	Custom,
	CustomCompatibility,
	Node,
	NodeDefinition,
	Scope,
	SupportedZodTypes
} from './types'

declare module 'zod/v4/core' {
	interface $ZodTypeDef {
		brand?: string
		scope?: Scope
	}
	interface $ZodCustomDef {
		token: string
	}
}

function isEffectivelyNever(
	schema: z.core.$ZodType,
	seen = new Set<z.ZodTypeAny>()
): schema is z.ZodNever {
	if (schema instanceof z.ZodNever) return true

	if (schema instanceof z.ZodLazy) {
		// break potential cycles
		if (seen.has(schema)) return false
		seen.add(schema)
		return isEffectivelyNever(schema._zod.def.getter(), seen)
	}

	return false
}

export function createBrand<BrandName extends string>(brandName: BrandName) {
	return function brand<Type extends z.ZodType>(type: Type) {
		type._zod.def.brand = brandName
		return type.brand<BrandName>()
	}
}

export function createCustom<Type, Token extends string>(token: Token) {
	const custom = z.custom<Type>()
	custom._zod.def.token = token
	return custom as Custom<Type, Token>
}

export function scoped<Type extends z.core.$ZodTypes>(type: Type, scope: Scope) {
	return new z.core.$ZodType({ ...type._zod.def, scope }) as Type
}

export function shapeOf(schema: z.core.$ZodType, scope?: Scope): string {
	const def = (schema as SupportedZodTypes)._zod.def

	function getShape() {
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
				return `_array(${shapeOf(def.element, scope)})`
			}
			case 'tuple': {
				return `_tuple(${def.items.map(item => shapeOf(item, scope)).join(',')})`
			}
			case 'object': {
				return `_object(${Object.entries(def.shape)
					.map(([key, value]) => `${key}:${shapeOf(value, scope)}`)
					.join(',')})`
			}
			case 'union': {
				return `_union(${def.options.map(option => shapeOf(option, scope)).join(',')})`
			}
			case 'custom': {
				return `_custom(${def.token})`
			}
			default: {
				throw `${def.type} not supported`
			}
		}
	}

	if (scope) {
		return `_scoped(${scope.name},${getShape()})`
	}
	if (def.brand) {
		return `_branded(${def.brand},${getShape()})`
	}
	return getShape()
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

	const compatibilities: Record<string, z.ZodType> = {}

	function getCompatible<Type extends z.core.$ZodType>(type: Type, _scope?: Scope) {
		const scope = _scope ?? type._zod.def.scope // keep current scope
		const key = shapeOf(type, scope)

		if (!compatibilities[key]) walk(type, scope)

		return compatibilities[key] ?? z.never()
	}

	function getAdditionalCompatibilities(type: z.core.$ZodType, scope?: Scope) {
		return (
			additionalCompatibilities.find(ac => shapeOf(ac.type, scope) === shapeOf(type, scope))
				?.compatibilities || []
		)
	}

	const allDefinitions: Record<string, z.ZodTypeAny> = {} // new map

	function makeDefinitionForScope<Name extends string, Input extends SupportedZodTypes>(
		opts: { name: Name; input: Input },
		scope?: Scope
	) {
		const id = scope ? `${opts.name}@${scope.name}` : opts.name // stable key
		if (allDefinitions[id]) return allDefinitions[id] // memoised

		const schema = z.lazy(() => {
			const compatible = getCompatible(opts.input, scope)
			return isEffectivelyNever(compatible)
				? z.never()
				: z.strictObject({
						input: compatible,
						node: z.literal(opts.name)
					})
		})

		allDefinitions[id] = schema
		return schema as z.ZodLazy<NodeDefinition<Name, Input, Nodes, Strict, AdditionalCompatibilities>>
	}

	const rootDefinitions: Record<string, z.ZodTypeAny> = {}
	for (const [name, { input }] of Object.entries(nodes)) {
		rootDefinitions[name] = makeDefinitionForScope({ input, name })
	}

	for (const [key, def] of Object.entries(rootDefinitions)) {
		if (isEffectivelyNever(def)) delete rootDefinitions[key]
	}

	function getCompatibleDefinitions(type: z.core.$ZodType, scope?: Scope) {
		return Object.entries(nodes)
			.filter(([, { output }]) => shapeOf(output, scope) === shapeOf(type, scope))
			.map(([name, { input }]) =>
				scope ? makeDefinitionForScope({ input, name }, scope) : rootDefinitions[name]
			)
			.filter((def): def is z.ZodTypeAny => !!def && !isEffectivelyNever(def))
	}

	function getInnerCompatabilities(type: z.core.$ZodType, scope?: Scope) {
		const {
			_zod: { def }
		} = type as z.core.$ZodTypes

		if (def.type === 'array') {
			const element = getCompatible(def.element, scope)
			return isEffectivelyNever(element) ? [] : [z.array(element)]
		}
		if (def.type === 'object') {
			const fields: Record<string, z.ZodTypeAny> = {}
			for (const [k, v] of Object.entries(def.shape)) {
				const c = getCompatible(v, scope)
				if (isEffectivelyNever(c)) return []
				fields[k] = c
			}
			return [z.strictObject(fields)]
		}

		if (def.type === 'union') {
			const options = def.options.map(o => getCompatible(o, scope)).filter(o => !isEffectivelyNever(o))
			return options.length ? [z.union(options)] : []
		}
		return []
	}

	function getContextCompatibilities(type: z.core.$ZodType, scope?: Scope) {
		if (!scope) return []

		const wantedShape = shapeOf(type)
		return Object.entries(scope.context ?? {})
			.filter(([, tokenType]) => shapeOf(tokenType) === wantedShape)
			.map(([token]) => z.literal(token))
	}

	function getSchema(type: z.core.$ZodType, scope?: Scope) {
		const branches = [
			...getCompatibleDefinitions(type, scope),
			...getInnerCompatabilities(type, scope),
			...getAdditionalCompatibilities(type, scope),
			...getContextCompatibilities(type, scope),

			...(strict ? [] : [type])
		] as [SupportedZodTypes, ...SupportedZodTypes[]]

		if (branches.length === 0) {
			console.warn(`No node produces shape "${shapeOf(type)}".`)
			return z.never()
		}
		if (branches.length === 1) return branches[0]

		return z.union(branches.filter(b => !isEffectivelyNever(b)))
	}

	function walk(type: z.core.$ZodType, _scope?: Scope) {
		const scope = _scope ?? type._zod.def.scope

		const key = shapeOf(type, scope)
		if (compatibilities[key]) return

		compatibilities[key] = z.lazy(() => getSchema(type, scope))
		getCompatibleDefinitions(type, scope)
		getInnerCompatabilities(type, scope)
		getContextCompatibilities(type, scope)

		if (type instanceof z.ZodArray) walk(type.def.element, scope)
		if (type instanceof z.ZodObject) for (const f of Object.values(type.def.shape)) walk(f, scope)
		if (type instanceof z.ZodUnion) for (const o of type.def.options) walk(o, scope)
	}

	for (const { input, output } of Object.values(nodes)) {
		walk(input)
		walk(output)
	}

	if (Object.keys(rootDefinitions).length === 0)
		throw new Error('createChain: every node collapsed - nothing can start the chain.')

	return {
		compatibilities: { ...compatibilities, ...allDefinitions },
		definitions: rootDefinitions
	}
}
