/** Jest configuration: runs the core (and content-script) TypeScript tests with ts-jest. */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/*.test.ts'],
	transform: {
		'^.+\\.ts$': ['ts-jest'],
	},
};
