import * as fs from 'fs/promises';
import * as readline from 'readline';
import pLimit from 'p-limit';

import { deepResearch, writeFinalReport } from './deep-research';
import { generateFeedback } from './feedback';
import { OutputManager } from './output-manager';

const output = new OutputManager();

// Helper function for consistent logging
function log(...args: any[]) {
  output.log(...args);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function to get user input
function askQuestion(query: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

async function runThesisAntithesis(initialQuery: string, breadth: number, depth: number) {
  const outputFile = 'synthesis-output.md';
  const inittext = `Thesis-Antithesis-Synthesis Research starting at ${new Date().toISOString()} with breadth ${breadth} and depth ${depth}.`;

  await fs.writeFile(outputFile, inittext, 'utf-8');
  log(`${inittext}\nCreating research plan...`);

  // Generate thesis and antithesis queries
  const thesisQuery = `Argue in favor of and find supporting evidence for: ${initialQuery}`;
  const antithesisQuery = `Argue against and find opposing evidence for: ${initialQuery}`;

  const progress = {
    currentDepth: depth,
    totalDepth: depth,
    currentBreadth: breadth * 2, // Account for both thesis and antithesis
    totalBreadth: breadth * 2,
    totalQueries: 2, // One for thesis, one for antithesis
    completedQueries: 0,
    currentQuery: undefined as string | undefined,
  };

  const limit = pLimit(2); // Run thesis and antithesis in parallel

  const [thesisResult, antithesisResult] = await Promise.all([
    limit(async () => {
      log('\nResearching thesis position...');
      progress.currentQuery = thesisQuery;
      const result = await deepResearch({
        query: thesisQuery,
        breadth,
        depth,
        onProgress: (researchProgress) => {
          // Combine progress from both searches
          output.updateProgress({
            ...progress,
            ...researchProgress,
            currentQuery: progress.currentQuery,
            totalQueries: progress.totalQueries,
            completedQueries: progress.completedQueries + (researchProgress.completedQueries / 2),
          });
        },
      });
      progress.completedQueries++;
      return result;
    }),
    limit(async () => {
      log('\nResearching antithesis position...');
      progress.currentQuery = antithesisQuery;
      const result = await deepResearch({
        query: antithesisQuery,
        breadth,
        depth,
        onProgress: (researchProgress) => {
          // Combine progress from both searches
          output.updateProgress({
            ...progress,
            ...researchProgress,
            currentQuery: progress.currentQuery,
            totalQueries: progress.totalQueries,
            completedQueries: progress.completedQueries + (researchProgress.completedQueries / 2),
          });
        },
      });
      progress.completedQueries++;
      return result;
    }),
  ]);

  // Combine learnings and URLs
  const combinedLearnings = [
    '## Thesis Findings:',
    ...thesisResult.learnings.map(l => `- ${l}`),
    '\n## Antithesis Findings:',
    ...antithesisResult.learnings.map(l => `- ${l}`)
  ];

  const combinedUrls = [...new Set([...thesisResult.visitedUrls, ...antithesisResult.visitedUrls])];

  // Create synthesis prompt
  const synthesisPrompt = `
Initial Query: ${initialQuery}

Please synthesize the following thesis and antithesis findings into a balanced analysis that acknowledges both perspectives and arrives at a nuanced conclusion:

${combinedLearnings.join('\n')}
`;

  // Generate synthesis report
  log('\nGenerating synthesis...');
  const report = await writeFinalReport({
    prompt: synthesisPrompt,
    learnings: combinedLearnings,
    visitedUrls: combinedUrls,
  });

  // Save report to file
  await fs.appendFile(outputFile, report, 'utf-8');

  console.log(report);
  console.log(`\nSynthesis report has been saved to ${outputFile}`);
  rl.close();
}

// run the agent
async function runNormalResearch(initialQuery: string, breadth: number, depth: number) {
  const outputFile = 'output.md';
  const inittext = `Research starting at ${new Date().toISOString()} with breadth ${breadth} and depth ${depth}.`;

  await fs.writeFile(outputFile, inittext, 'utf-8');
  log(`${inittext}\nCreating research plan...`);

  // Generate follow-up questions
  const followUpQuestions = await generateFeedback({
    query: initialQuery,
  });

  log(
    '\nTo better understand your research needs, please answer these follow-up questions:',
  );

  // Collect answers to follow-up questions
  const answers: string[] = [];
  for (const question of followUpQuestions) {
    const answer = await askQuestion(`\n${question}\nYour answer: `);
    answers.push(answer);
  }

  // Combine all information for deep research
  const combinedQuery = `
Initial Query: ${initialQuery}
Follow-up Questions and Answers:
${followUpQuestions.map((q: string, i: number) => `Q: ${q}\nA: ${answers[i]}`).join('\n')}
`;
  await fs.appendFile(outputFile, combinedQuery, 'utf-8');

  log('\nResearching your topic...');

  log('\nStarting research with progress tracking...\n');
  
  const { learnings, visitedUrls } = await deepResearch({
    query: combinedQuery,
    breadth,
    depth,
    onProgress: (progress) => {
      output.updateProgress(progress);
    },
  });

  const URLsandLearnings = `\n\nLearnings:\n\n${learnings.join('\n')}\n\nVisited URLs (${visitedUrls.length}):\n\n${visitedUrls.join('\n')}\n`;
  await fs.appendFile(outputFile, URLsandLearnings, 'utf-8');

  log(URLsandLearnings);
  log('Writing final report...');

  const report = `\n\nFinal Report:\n\n${await writeFinalReport({
    prompt: combinedQuery,
    learnings,
    visitedUrls,
  })}` 

  // Save report to file
  await fs.appendFile(outputFile, report, 'utf-8');

  console.log(report);
  console.log(`\nReport has been saved to ${outputFile}`);
  rl.close();
}

async function run() {
  const args = process.argv.slice(2);
  const dialecticMode = args.includes('--dialectic');

  // Get initial query
  const initialQuery = await askQuestion('What would you like to research? ');
  
  // Get breath and depth parameters
  const breadth =
    parseInt(
      await askQuestion(
        'Enter research breadth (recommended 2-10, default 4): ',
      ),
      10,
    ) || 4;
  const depth =
    parseInt(
      await askQuestion('Enter research depth (recommended 1-5, default 2): '),
      10,
    ) || 2;

  if (dialecticMode) {
    await runThesisAntithesis(initialQuery, breadth, depth);
  } else {
    await runNormalResearch(initialQuery, breadth, depth);
  }
}

run().catch(console.error);
