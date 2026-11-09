/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Circular dependencies make the plugin boundary graph hard to reason about.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'info',
      comment: 'A source file nothing imports and that imports nothing else — likely dead or an entry point.',
      from: {
        orphan: true,
        pathNot: [
          '\\.(test|spec)\\.ts$',
          '(^|/)tests?/',
          '(^|/)scripts/',
          '\\.d\\.ts$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: [
        'node_modules',
        '(^|/)lib/',
        '(^|/)dist/',
        '(^|/)coverage/',
        '\\.tsbuildinfo$',
        '(^|/)snapshots/',
        '(^|/)\\.storages/',
        '(^|/)\\.sessions/',
        '(^|/)worktrees/',
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'types'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: '^(packages|apps|vendor)/[^/]+/[^/]+',
      },
    },
  },
}
