# balance_analyzer_subgraph
```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	balanceGapAnalyzerNode(balanceGapAnalyzerNode)
	confidenceCalculatorNode(confidenceCalculatorNode)
	__end__([<p>__end__</p>]):::last
	__start__ --> balanceGapAnalyzerNode;
	balanceGapAnalyzerNode --> confidenceCalculatorNode;
	confidenceCalculatorNode --> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;
```
