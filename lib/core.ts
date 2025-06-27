import type { z } from 'zod/v4'

type DepthMap = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

type MAX_DEPTH = 10

export type $SupportedZodTypes<Depth extends number = MAX_DEPTH> = Depth extends 0
	? never
	:
			| z.ZodString
			| z.ZodNumber
			| z.ZodBoolean
			| z.ZodUndefined
			| z.ZodNull
			| z.ZodLiteral<string>
			| z.ZodEnum<Record<string, string>>
			| z.ZodObject<Record<string, $SupportedZodTypes>>
			| z.ZodArray<$SupportedZodTypes>
			| z.ZodUnion<readonly $SupportedZodTypes<DepthMap[Depth]>[]>

/*

Recursive Unions in TS explode without a depth limit:
https://github.com/Microsoft/TypeScript/issues/18754
https://github.com/microsoft/TypeScript/issues/46180
https://www.esveo.com/en/blog/how-to-workaround-the-max-recursion-depth-in-typescript

They expanded this limit:
https://github.com/microsoft/TypeScript/pull/45025#issuecomment-900765731
But reverted:
https://github.com/microsoft/TypeScript/pull/45025#issuecomment-1605568499

A depth counter is a common pattern used by Zod, Immer, TanStack, Kysely, etc

MAX_DEPTH 10 looks like:
input: {
	thing: z.union([
		z.union([
			z.union([
				z.union([
					z.union([
						z.union([
							z.union([
								z.union([
									z.union([
										z.union([
											z.string()
										])
									])
								])
							])
						])
					])
				])
			])
		])
	])
},

It only applies to unions, not arrays or objects. For example, you can do this:
input: {
	thing: z.array(
		z.array(
			z.array(
				z.array(
					z.array(
						z.array(
							z.array(
								z.array(
									z.array(
										z.array(
											z.array(
												z.array(
													z.array(
														z.array(
															z.array(
																z.array(
																	z.array(
																		z.array(
																			z.array(
																				z.string()
																			)
																		)	
																	)
																)
															)
														)
													)
												)
											)
										)
									)
								)
							)
						)
					)
				)
			)
		)
	)
},
*/
