/* i18n key mapping for work metadata (status/platform/scope): shared by
   WorkCard / WorkRail / the detail page. Invalid values fall to safe
   defaults so dirty data never breaks rendering. */

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
