import { z } from 'zod/v4'
import { $ZodType, type $ZodTypes } from 'zod/v4/core'
import type { Brand, Branded, Custom, Scope, Scoped } from './types'

declare module 'zod/v4/core' {
	interface $ZodTypeDef {
		brand?: Brand
		scope?: Scope
	}
	interface $ZodCustomDef {
		token: string
	}
}

export function brand<Brand extends string, Strict extends boolean>(name: Brand, strict: Strict) {
	return <Type extends $ZodType>(type: Type) => {
		type._zod.def.brand = { name, strict }
		return type as Branded<Type, Brand, Strict>
	}
}

export function custom<Type, Token extends string>(token: Token) {
	const custom = z.custom<Type>()
	custom._zod.def.token = token
	return custom as Custom<Type, Token>
}

export function scope<
	Type extends $ZodType,
	Name extends string,
	Context extends Record<string, $ZodType>
>(type: Type, scope: { name: Name; context: Context }) {
	return new $ZodType({ ...type._zod.def, scope }) as Scoped<Type, Name, Context>
}

export function shapeOf(type: $ZodType, _scope?: Scope): string {
	const def = (type as $ZodTypes)._zod.def

	const scope = _scope ?? def.scope

	function shape() {
		switch (def.type) {
			case 'string': {
				return 'String'
			}
			case 'number': {
				return 'Number'
			}
			case 'boolean': {
				return 'Boolean'
			}
			case 'undefined': {
				return 'Undefined'
			}
			case 'null': {
				return 'Null'
			}
			case 'literal': {
				return `Literal(${def.values[0]})`
			}
			case 'enum': {
				return `Enum(${Object.values(def.entries).join(',')})`
			}
			case 'array': {
				return `Array(${shapeOf(def.element, scope)})`
			}
			case 'tuple': {
				return `Tuple(${def.items.map(item => shapeOf(item, scope)).join(',')})`
			}
			case 'object': {
				return `Object(${Object.entries(def.shape)
					.map(([key, value]) => `${key}:${shapeOf(value, scope)}`)
					.join(',')})`
			}
			case 'union': {
				return `Union(${def.options.map(option => shapeOf(option, scope)).join(',')})`
			}
			case 'custom': {
				return `Custom(${def.token})`
			}
			default: {
				throw `${def.type} not supported`
			}
		}
	}

	if (scope) {
		return `scoped(${scope.name},${shape()})`
	}

	if (def.brand) {
		return `branded(${def.brand.name},${shape()})`
	}

	return shape()
}
