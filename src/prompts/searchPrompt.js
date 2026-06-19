export const searchPrompt = (query) => `You must respond with ONLY a valid JSON array. No markdown. No backticks. Start with [ and end with ]. Nothing else.

Suggest 5 real, published research papers on this topic: "${query}"

Only suggest papers you are highly confident actually exist. Return this exact JSON array:
[
  {
    "title": "exact paper title",
    "authors": "FirstAuthor et al.",
    "year": "YYYY",
    "venue": "Conference or Journal name, e.g. NeurIPS 2017",
    "abstract": "2-3 sentences describing what this paper contributes and why it matters",
    "arxiv_id": "1706.03762 or null if not on arXiv",
    "keywords": ["tag1", "tag2", "tag3"]
  }
]

EXAMPLE for topic "transformer attention mechanisms":
[{"title":"Attention Is All You Need","authors":"Vaswani et al.","year":"2017","venue":"NeurIPS 2017","abstract":"Introduces the Transformer, an architecture that replaces recurrent networks with self-attention for sequence tasks. Achieves state-of-the-art results on machine translation benchmarks. Enables dramatically better parallelization during training.","arxiv_id":"1706.03762","keywords":["transformer","self-attention","NLP"]},{"title":"BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding","authors":"Devlin et al.","year":"2019","venue":"NAACL 2019","abstract":"BERT pre-trains deep bidirectional representations by jointly conditioning on both left and right context in all layers. Fine-tuned BERT achieves state-of-the-art on 11 NLP tasks. Introduces masked language modeling as a pre-training objective.","arxiv_id":"1810.04805","keywords":["BERT","pre-training","NLP"]}]`;
