import { ASSET_TYPES } from 'shared/constants'
import type { GlobalAPI } from 'types/global-api'
import { isFunction, isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters(Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  // 创建 assets 注册方法，包括组件 指令 过滤器
  ASSET_TYPES.forEach(type => {
    // @ts-expect-error function is not exact same type
    Vue[type] = function (
      id: string,
      definition?: Function | Object
    ): Function | Object | void {

      // 没给定义，直接返回
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (__DEV__ && type === 'component') {
          validateComponentName(id)
        }

        // 组件
        if (type === 'component' && isPlainObject(definition)) {
          // @ts-expect-error
          definition.name = definition.name || id

          // 子组件可能也有 extend 方法  VueComponent.component 方法
          definition = this.options._base.extend(definition)
        }

        // 指令
        if (type === 'directive' && isFunction(definition)) {
          definition = { bind: definition, update: definition }
        }
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
