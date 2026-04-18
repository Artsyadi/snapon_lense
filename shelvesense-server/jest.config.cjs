module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
        diagnostics: false,
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 180000,
  verbose: true,
};
