import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

// 里会根据不同平台传递不同的 baseOptions 创建编译器
const { compile, compileToFunctions } = createCompiler(baseOptions)

export { compile, compileToFunctions }
