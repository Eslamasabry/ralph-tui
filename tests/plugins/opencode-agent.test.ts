/**
 * ABOUTME: Tests for the OpenCodeAgentPlugin.
 * Tests specific behaviors like model validation, setup questions, and agent types.
 * Also tests stdin input handling for Windows shell interpretation safety.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { OpenCodeAgentPlugin } from '../../src/plugins/agents/builtin/opencode.js';
import type { AgentFileContext, AgentExecuteOptions } from '../../src/plugins/agents/types.js';

/**
 * Test subclass to expose protected methods for testing.
 */
class TestableOpenCodePlugin extends OpenCodeAgentPlugin {
  /** Expose buildArgs for testing */
  testBuildArgs(
    prompt: string,
    files?: AgentFileContext[],
    options?: AgentExecuteOptions
  ): string[] {
    return this['buildArgs'](prompt, files, options);
  }

  /** Expose getStdinInput for testing */
  testGetStdinInput(
    prompt: string,
    files?: AgentFileContext[],
    options?: AgentExecuteOptions
  ): string | undefined {
    return this['getStdinInput'](prompt, files, options);
  }
}

describe('OpenCodeAgentPlugin', () => {
  let plugin: OpenCodeAgentPlugin;

  beforeEach(() => {
    plugin = new OpenCodeAgentPlugin();
  });

  afterEach(async () => {
    await plugin.dispose();
  });

  describe('metadata', () => {
    test('has correct plugin ID', () => {
      expect(plugin.meta.id).toBe('opencode');
    });

    test('has correct default command', () => {
      expect(plugin.meta.defaultCommand).toBe('opencode');
    });

    test('supports streaming', () => {
      expect(plugin.meta.supportsStreaming).toBe(true);
    });

    test('supports interruption', () => {
      expect(plugin.meta.supportsInterrupt).toBe(true);
    });

    test('supports file context', () => {
      expect(plugin.meta.supportsFileContext).toBe(true);
    });

    test('supports subagent tracing', () => {
      expect(plugin.meta.supportsSubagentTracing).toBe(true);
    });
  });

  describe('initialization', () => {
    test('initializes with default config', async () => {
      await plugin.initialize({});
      expect(await plugin.isReady()).toBe(true);
    });

    test('accepts provider config', async () => {
      await plugin.initialize({ provider: 'anthropic' });
      expect(await plugin.isReady()).toBe(true);
    });

    test('accepts model config', async () => {
      await plugin.initialize({ model: 'claude-3-5-sonnet' });
      expect(await plugin.isReady()).toBe(true);
    });

    test('accepts variant config', async () => {
      // Variant validation is delegated to OpenCode CLI - any string is accepted
      await plugin.initialize({ variant: 'high' });
      expect(await plugin.isReady()).toBe(true);
    });

    test('accepts any variant string', async () => {
      // Different models support different variants, so we accept any value
      await plugin.initialize({ variant: 'custom-variant' });
      expect(await plugin.isReady()).toBe(true);
    });

    test('accepts agent type config', async () => {
      await plugin.initialize({ agent: 'build' });
      expect(await plugin.isReady()).toBe(true);
    });

    test('accepts format config', async () => {
      await plugin.initialize({ format: 'json' });
      expect(await plugin.isReady()).toBe(true);
    });

    test('accepts timeout config', async () => {
      await plugin.initialize({ timeout: 120000 });
      expect(await plugin.isReady()).toBe(true);
    });

    test('ignores invalid agent type', async () => {
      await plugin.initialize({ agent: 'invalid' });
      expect(await plugin.isReady()).toBe(true);
    });
  });

  describe('validateModel', () => {
    test('accepts empty string', () => {
      expect(plugin.validateModel('')).toBeNull();
    });

    test('accepts provider/model format', () => {
      expect(plugin.validateModel('anthropic/claude-3-5-sonnet')).toBeNull();
    });

    test('accepts openai provider format', () => {
      expect(plugin.validateModel('openai/gpt-4o')).toBeNull();
    });

    test('accepts model without provider', () => {
      expect(plugin.validateModel('claude-3-5-sonnet')).toBeNull();
    });

    test('rejects malformed provider/model', () => {
      const result = plugin.validateModel('provider/');
      expect(result).not.toBeNull();
      expect(result).toContain('Invalid model format');
    });

    test('rejects empty provider with slash', () => {
      const result = plugin.validateModel('/model');
      expect(result).not.toBeNull();
      expect(result).toContain('Invalid model format');
    });
  });

  describe('validateSetup', () => {
    test('accepts valid agent type: general', async () => {
      expect(await plugin.validateSetup({ agent: 'general' })).toBeNull();
    });

    test('accepts valid agent type: build', async () => {
      expect(await plugin.validateSetup({ agent: 'build' })).toBeNull();
    });

    test('accepts valid agent type: plan', async () => {
      expect(await plugin.validateSetup({ agent: 'plan' })).toBeNull();
    });

    test('accepts empty agent type', async () => {
      expect(await plugin.validateSetup({ agent: '' })).toBeNull();
    });

    test('rejects invalid agent type', async () => {
      const result = await plugin.validateSetup({ agent: 'invalid' });
      expect(result).not.toBeNull();
      expect(result).toContain('Invalid agent type');
    });

    test('accepts any provider string', async () => {
      // OpenCode supports 75+ providers - validation is delegated to CLI
      expect(await plugin.validateSetup({ provider: 'anthropic' })).toBeNull();
      expect(await plugin.validateSetup({ provider: 'openai' })).toBeNull();
      expect(await plugin.validateSetup({ provider: 'google' })).toBeNull();
      expect(await plugin.validateSetup({ provider: 'custom-provider' })).toBeNull();
    });

    test('accepts any variant string', async () => {
      // Variant validation is delegated to OpenCode CLI - different models have different values
      expect(await plugin.validateSetup({ variant: 'minimal' })).toBeNull();
      expect(await plugin.validateSetup({ variant: 'high' })).toBeNull();
      expect(await plugin.validateSetup({ variant: 'max' })).toBeNull();
      expect(await plugin.validateSetup({ variant: 'custom' })).toBeNull();
      expect(await plugin.validateSetup({ variant: '' })).toBeNull();
    });
  });

  describe('getSetupQuestions', () => {
    test('includes command question from base', () => {
      const questions = plugin.getSetupQuestions();
      const commandQuestion = questions.find((q) => q.id === 'command');
      expect(commandQuestion).toBeDefined();
      expect(commandQuestion?.type).toBe('path');
    });

    test('includes provider question', () => {
      const questions = plugin.getSetupQuestions();
      const providerQuestion = questions.find((q) => q.id === 'provider');
      expect(providerQuestion).toBeDefined();
      expect(providerQuestion?.type).toBe('select');
      expect(providerQuestion?.choices?.some((c) => c.value === 'anthropic')).toBe(true);
      expect(providerQuestion?.choices?.some((c) => c.value === 'openai')).toBe(true);
    });

    test('includes model question', () => {
      const questions = plugin.getSetupQuestions();
      const modelQuestion = questions.find((q) => q.id === 'model');
      expect(modelQuestion).toBeDefined();
      expect(modelQuestion?.type).toBe('text');
    });

    test('includes agent type question', () => {
      const questions = plugin.getSetupQuestions();
      const agentQuestion = questions.find((q) => q.id === 'agent');
      expect(agentQuestion).toBeDefined();
      expect(agentQuestion?.type).toBe('select');
      expect(agentQuestion?.choices?.length).toBe(3);
    });

    // Note: format is not a setup question - it's hardcoded to 'json'
    // because the streaming output parser requires JSON format to work
  });

  describe('dispose', () => {
    test('disposes cleanly', async () => {
      await plugin.initialize({});
      await plugin.dispose();
      expect(await plugin.isReady()).toBe(false);
    });
  });

  describe('buildArgs (stdin input for Windows safety)', () => {
    let testablePlugin: TestableOpenCodePlugin;

    beforeEach(async () => {
      testablePlugin = new TestableOpenCodePlugin();
      await testablePlugin.initialize({});
    });

    afterEach(async () => {
      await testablePlugin.dispose();
    });

    test('does NOT include prompt in args (passed via stdin instead)', () => {
      const prompt = 'Hello world';
      const args = testablePlugin.testBuildArgs(prompt);

      // The prompt should NOT be in args - it's passed via stdin
      expect(args).not.toContain(prompt);
      // Should still have basic args
      expect(args).toContain('run');
      expect(args).toContain('--format');
      expect(args).toContain('json');
    });

    test('does NOT include prompt with special characters in args', () => {
      // These characters would cause "syntax error" on Windows cmd.exe
      const prompt = 'feature with & special | characters > test "quoted"';
      const args = testablePlugin.testBuildArgs(prompt);

      // The prompt with special chars should NOT be in args
      expect(args).not.toContain(prompt);
      // None of the special chars should appear in any arg
      for (const arg of args) {
        expect(arg).not.toContain('&');
        expect(arg).not.toContain('|');
        expect(arg).not.toContain('>');
      }
    });

    test('includes file context in args', () => {
      const prompt = 'Review this file';
      const files: AgentFileContext[] = [
        { path: '/path/to/file.ts' },
      ];
      const args = testablePlugin.testBuildArgs(prompt, files);

      expect(args).toContain('--file');
      expect(args).toContain('/path/to/file.ts');
    });

    test('includes multiple file contexts', () => {
      const prompt = 'Review these files';
      const files: AgentFileContext[] = [
        { path: '/path/to/file1.ts' },
        { path: '/path/to/file2.ts' },
      ];
      const args = testablePlugin.testBuildArgs(prompt, files);

      // Should have --file for each file
      const fileFlags = args.filter((arg) => arg === '--file');
      expect(fileFlags.length).toBe(2);
      expect(args).toContain('/path/to/file1.ts');
      expect(args).toContain('/path/to/file2.ts');
    });
  });

  describe('getStdinInput', () => {
    let testablePlugin: TestableOpenCodePlugin;

    beforeEach(async () => {
      testablePlugin = new TestableOpenCodePlugin();
      await testablePlugin.initialize({});
    });

    afterEach(async () => {
      await testablePlugin.dispose();
    });

    test('returns the prompt for stdin', () => {
      const prompt = 'Hello world';
      const stdinInput = testablePlugin.testGetStdinInput(prompt);

      expect(stdinInput).toBe(prompt);
    });

    test('returns prompt with special characters unchanged', () => {
      // These characters would cause issues if passed as CLI args on Windows
      const prompt = 'feature with & special | characters > test "quoted"';
      const stdinInput = testablePlugin.testGetStdinInput(prompt);

      // Stdin should contain the prompt exactly as-is (no escaping needed)
      expect(stdinInput).toBe(prompt);
    });

    test('returns prompt with newlines', () => {
      const prompt = 'Line 1\nLine 2\nLine 3';
      const stdinInput = testablePlugin.testGetStdinInput(prompt);

      expect(stdinInput).toBe(prompt);
      expect(stdinInput).toContain('\n');
    });

    test('returns prompt with unicode characters', () => {
      const prompt = 'Hello 世界 🎉 émojis';
      const stdinInput = testablePlugin.testGetStdinInput(prompt);

      expect(stdinInput).toBe(prompt);
    });
  });
});
