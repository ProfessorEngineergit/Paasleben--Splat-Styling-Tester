import { defineConfig } from 'vite';

const repository = process.env.GITHUB_REPOSITORY;
const repositoryName = repository?.split('/')[1];

const base =
  process.env.GITHUB_ACTIONS === 'true' && repositoryName
    ? `/${repositoryName}/`
    : '/';

export default defineConfig({
  base,
});
