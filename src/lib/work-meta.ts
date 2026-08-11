/* 作品元数据(状态/平台/收录口径)的 i18n 键映射:WorkCard / WorkRail / 详情页共用。
   非法值落到安全默认,保证脏数据不炸渲染。 */

export function workStatusKey(status: string) {
  switch (status) {
    case "planning":
      return "works.statusPlanning" as const;
    case "building":
      return "works.statusBuilding" as const;
    case "archived":
      return "works.statusArchived" as const;
    default:
      return "works.statusReleased" as const;
  }
}


export function awesomeScopeKey(scope: string) {
  switch (scope) {
    case "eco":
      return "awesome.scopeEco" as const;
    case "part":
      return "awesome.scopePart" as const;
    default:
      return "awesome.scopeBase" as const;
  }
}
