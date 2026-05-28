import { createContext, useContext } from 'react'
export const LinkPathsContext = createContext({})
export const useLinkPaths = () => useContext(LinkPathsContext)
