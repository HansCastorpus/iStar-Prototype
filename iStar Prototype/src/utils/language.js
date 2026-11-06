// Which modeling language is active ('istar2' = pure iStar 2.0, 'custom' = the modified version) decides which
// element and link types are offered. Sub-actors (diagrams nested in an element) are not part of iStar 2.0.
export const NOT_ISTAR2 = ['subactor']

// `types` without the ones the language doesn't have. `keep`: a type to leave in anyway (the one already in use)
export const typesFor = (language, types, keep) =>
  language === 'istar2' ? types.filter(type => !NOT_ISTAR2.includes(type) || type === keep) : types

// Every link type, in the order they are offered
export const LINK_TYPES = ['depends-on', 'or', 'xor', 'and', 'help', 'hurt', 'make', 'break', 'needed-by', 'part-of']
