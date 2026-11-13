module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: { allowJs: true } }],
  },
  // Node 24 can require these ESM packages; Jest 29 must transform their JS.
  transformIgnorePatterns: [
    'node_modules/(?!\\.pnpm/|uuid/|otplib/|marked/|htmlparser2/|domhandler/|domutils/|dom-serializer/|domelementtype/|entities/|css-select/|css-what/|nth-check/|boolbase/|@scure/|@noble/|@otplib/)',
    'node_modules/\\.pnpm/(?!(?:uuid|otplib|marked|htmlparser2|domhandler|domutils|dom-serializer|domelementtype|entities|css-select|css-what|nth-check|boolbase|@scure\\+[^/]+|@noble\\+[^/]+|@otplib\\+[^/]+)@)',
  ],
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
