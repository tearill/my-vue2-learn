import type { GlobalAPI } from 'types/global-api'
import { mergeOptions } from '../util/index'

// 提供 mixin api
export function initMixin(Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {

    // 利用 mergeOptions 把传入的选项混入到自己的 options 上面
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
