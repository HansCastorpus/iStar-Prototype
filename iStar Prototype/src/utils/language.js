// Which modeling language is active ('istar2' = pure iStar 2.0, 'custom' = the modified version) decides which
// element and link types are offered. These are not part of iStar 2.0: sub-actors (diagrams nested in an element),
// the XOR refinement (iStar 2.0 only has AND / OR) and the part-of link.
export const NOT_ISTAR2 = ['subactor', 'xor', 'part-of']

// `types` without the ones the language doesn't have. `keep`: a type to leave in anyway (the one already in use)
export const typesFor = (language, types, keep) =>
  language === 'istar2' ? types.filter(type => !NOT_ISTAR2.includes(type) || type === keep) : types
