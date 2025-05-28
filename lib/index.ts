import z from 'zod/v4'
import type { $strict } from 'zod/v4/core'

type TransformerMap = Record<
	string,
	{
		schema: {
			input: Record<string, z.ZodType>
			output: z.ZodType
		}
	}
>

type ShapeOf<T extends z.ZodType> = T extends z.ZodString
	? 'string'
	: T extends z.ZodNumber
		? 'number'
		: T extends z.ZodBoolean
			? 'boolean'
			: T extends z.ZodDate
				? 'date'
				: T extends z.ZodArray<infer Inner extends z.ZodType>
					? ShapeOf<Inner>[]
					: T extends z.ZodObject<infer Shape extends Record<string, z.ZodType>, $strict>
						? {
								[K in keyof Shape]: ShapeOf<Shape[K]>
							}
						: // Some types not handled yet
							unknown

export function shapeOf<T extends z.ZodType>(schema: T): ShapeOf<T> {
	if (schema instanceof z.ZodString) return 'string' as ShapeOf<T>
	if (schema instanceof z.ZodNumber) return 'number' as ShapeOf<T>
	if (schema instanceof z.ZodBoolean) return 'boolean' as ShapeOf<T>
	if (schema instanceof z.ZodDate) return 'date' as ShapeOf<T>

	if (schema instanceof z.ZodArray) {
		// Is this a zod 4 bug? Look at it without the as z.ZodType..
		const inner = shapeOf(schema.def.element as z.ZodType)
		return [inner] as ShapeOf<T>
	}

	if (schema instanceof z.ZodObject) {
		const out: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(schema.shape)) {
			out[key] = shapeOf(value)
		}
		return out as ShapeOf<T>
	}

	return 'unknown' as ShapeOf<T>
}

// === scratch ===

function stableStringify(obj: unknown): string {
	if (Array.isArray(obj)) {
		return `[${obj.map(stableStringify).join(',')}]`
	}
	if (obj && typeof obj === 'object') {
		const keys = Object.keys(obj).sort()
		return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
	}
	return JSON.stringify(obj)
}

export async function stableHash(obj: unknown): Promise<string> {
	const str = stableStringify(obj)
	const data = new TextEncoder().encode(str)
	const hashBuffer = await crypto.subtle.digest('SHA-256', data)
	return Array.from(new Uint8Array(hashBuffer))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('')
}

// === end scratch ===

export function isCompatible<TypeOne extends z.ZodType, TypeTwo extends z.ZodType>(
	typeOne: TypeOne,
	typeTwo: TypeTwo
) {
	const shapeOne = shapeOf(typeOne) as unknown
	const shapeTwo = shapeOf(typeTwo) as unknown

	return (shapeOne === shapeTwo) as ShapeOf<TypeOne> extends ShapeOf<TypeTwo> ? true : false
}

export function getCompatible<Transformers extends TransformerMap, Schema extends z.ZodType>({
	transformers,
	schema
}: { transformers: Transformers; schema: Schema }) {
	const compatible = Object.entries(transformers)
		.filter(([_, value]) => {
			return isCompatible(value.schema.output, schema)
		})
		.map(([key, value]) => {
			return z.object({
				node: z.literal(key as string),
				input: z.object(value.schema.input)
			})
		}) as {
		[T in keyof Transformers]: ReturnType<
			typeof isCompatible<Transformers[T]['schema']['output'], Schema>
		> extends true
			? z.ZodObject<
					{
						node: z.ZodLiteral<T>
						input: z.ZodObject<Transformers[T]['schema']['input'], $strict>
					},
					$strict
				>
			: never
	}[keyof Transformers][]

	return z.union([schema, ...compatible])
}

export function createNode<
	Transformers extends TransformerMap,
	Name extends string,
	Input extends Record<string, z.ZodType>,
	Output extends z.ZodType
>({
	transformers,
	name,
	schema
}: {
	transformers: Transformers
	name: Name
	schema: { input: Input; output: Output }
}) {
	return z.object({
		node: z.literal(name),
		get input() {
			return z.object(
				Object.fromEntries(
					Object.entries(schema.input).map(([key, value]) => {
						return [key, getCompatible({ transformers, schema: value })]
					})
				) as {
					[I in keyof Input]: ReturnType<typeof getCompatible<Transformers, Input[I]>>
				}
			)
		}
	})
}

export function createChain<Transformers extends TransformerMap>(transformers: Transformers) {
	const nodes = Object.entries(transformers).map(([key, value]) =>
		createNode({
			transformers,
			name: key,
			schema: value.schema
		})
	) as {
		[T in keyof Transformers]: ReturnType<
			typeof createNode<
				Transformers,
				T & string,
				Transformers[T]['schema']['input'],
				Transformers[T]['schema']['output']
			>
		>
	}[keyof Transformers][]

	return { nodes }
}
