import * as readline from "readline";
import tokenizer from "wink-tokenizer";
import stopwords from "stopwords-iso"; // object of stopwords for multiple languages
// import stopwordsDE from de; // german stopwords
import normalizer from "normalize-for-search";
import { sample, filter, max, groupBy, sortBy } from "lodash";
import "regenerator-runtime/runtime";
//import synonyms from "germansynonyms";
import Tagify from "@yaireo/tagify";

// import jargon from "@clipperhouse/jargon";
// import stackexchange from "@clipperhouse/jargon/stackexchange"; // a dictionary
// import fs from "fs";
// include wink-nlp (lemmatizing)
const openthesaurus = require("openthesaurus");
const glossarData = require("../data/glossar.json");
const configFile = require("../data/config.json");

let configDefinition: {
  use_tagify: boolean;
  use_tagify_comment: string;
  waittime: number;
  waittime_comment: string;
  opt_enabled: boolean;
  opt_enabled_comment: string;
  assign_top: boolean;
  assign_top_comment: string;
  include_top: boolean;
  include_top_comment: string;
};

export class Taggy {
  public name: string = "taggy";
  private tagify!: Tagify;
  private tagifyOverride!: Tagify;
  private winkTokenizer: tokenizer;
  private stopwordsDE: any;
  private openthesaurus: any;

  private inputField!: HTMLInputElement;
  private outputField!: HTMLInputElement;
  private frequencyOutput: HTMLSpanElement;
  private overrideOutput: HTMLInputElement | undefined;
  private mostFrequentWords: string[] = [];
  private mostFrequentTopTags: any[] = [];
  private timeout: any = null;

  public config = configDefinition;
  private USE_TAGIFY: boolean = configFile["use-tagify"] === "true";
  private OPENTHESAURUS_ENABLED: boolean =
    configFile["openthesaurus"] === "true";
  private ASSIGN_TOP: boolean = configFile.categories["assign-top"] === "true";
  private INCLUDE_TOP: boolean =
    configFile.categories["include-top"] === "true";

  /**
   * Create a new instance of taggy
   * @param inputField Input field where user text goes
   * @param outputField Output field where the tags will show up
   * @param frequencyOutput Show frequency of identified tags
   * @param overrideOutput Show identified top tags with possibility to override default detection
   * @param options Optional: Provide options for taggys behaviour
   */
  constructor(
    inputField: HTMLInputElement,
    outputField: HTMLInputElement,
    frequencyOutput: HTMLSpanElement,
    overrideOutput: HTMLInputElement,
    options: Object
  ) {
    // config (again) -> TODO: SANITIZE CONFIG STUFF (ABOVE)
    this.config = {
      use_tagify: this.USE_TAGIFY,
      use_tagify_comment: configFile["use-tagify-comment"],
      waittime: configFile["waittime"],
      waittime_comment: configFile["waittime-comment"],
      opt_enabled: this.OPENTHESAURUS_ENABLED,
      opt_enabled_comment: configFile["openthesaurus-comment"],
      assign_top: this.ASSIGN_TOP,
      assign_top_comment: configFile.categories["assign-top-comment"],
      include_top: this.INCLUDE_TOP,
      include_top_comment: configFile.categories["include-top-comment"],
    };
    // console.log("TAGGY CONFIG", this.config);

    this.setInputField(inputField);
    this.outputField = outputField;

    this.winkTokenizer = new tokenizer();
    this.stopwordsDE = stopwords.de;
    this.openthesaurus = openthesaurus;

    if (this.outputField) this.outputField.setAttribute("readOnly", "true");
    if (this.config.use_tagify) this.createTagify(this.outputField);

    this.frequencyOutput = frequencyOutput;

    // this.overrideOutput = overrideOutput;
    if (overrideOutput) {
      this.setOverrideOutput(overrideOutput);
      if (this.config.use_tagify) this.createTagifyOverride(overrideOutput);
    }

    console.log("created a new taggy instance");
  }

  setInputField(inputField: HTMLInputElement) {
    this.inputField = inputField;
    this.inputField.addEventListener("input", (event) => {
      this.handleInputEventListener();
    });
    console.log("taggy", "input field and handler set", this.inputField);
  }

  handleInputEventListener() {
    console.log("INSIDE EVENT LISTENER");
    // console.log("WAITTIME", this.config.waittime);
    this.outputField.style.backgroundColor = "#f2f102";
    if (this.tagify) {
      this.tagify.DOM.scope.style.setProperty("--tags-border-color", "#ef4d60");
      this.tagify.DOM.scope.style.setProperty("background", "#f2f102");
    }
    clearTimeout(this.timeout);

    // make a new timeout set to go off in 1000ms
    this.timeout = setTimeout(async () => {
      // loader.style.display = "block";

      await this.processAndAddTags(this.inputField.value, this.outputField);

      this.outputField.style.backgroundColor = "#ffffff";
      // this.addTags(result);
    }, this.config.waittime);
  }

  setOutputField(outputField: HTMLInputElement) {
    // outputField.setAttribute("value", "");
    outputField.readOnly = true;
    outputField.value = "";
    this.outputField = outputField;
    console.log("taggy", "output field set");
  }

  setFrequencyOutput(frequencyOutput: HTMLSpanElement) {
    this.frequencyOutput = frequencyOutput;
  }

  setOverrideOutput(overrideOutput: HTMLInputElement) {
    this.overrideOutput = overrideOutput;
    this.overrideOutput.addEventListener("click", (event) => {
      this.handleOverrideOutputEventListener(event);
    });
    console.log("taggy", "Override field and handler set", this.overrideOutput);
  }

  handleOverrideOutputEventListener(event: MouseEvent) {
    console.log("INSIDE EVENT LISTENER | OVERRIDE");
    const target = event.target as HTMLElement;
    if (target) console.log(target.innerHTML);
  }

  overrideTopTag(input: string) {
    if (input) {
      // if (this.config.use_tagify && this.tagify) {
      //   this.tagify.removeTags();
      //   this.tagify.addTags(input);
      // } else {
      //   this.
      // }
      this.addTags(input);
    }
  }

  getConfig(): Object {
    return this.config;
  }

  getGlossar(): JSON {
    return glossarData;
  }

  setOption(option: string, value: boolean) {
    console.log("setting", option, "to", value);
    if (option == "use_tagify") {
      this.config.use_tagify = value;
    }
    if (option == "assign_top") {
      this.config.assign_top = value;
    }
    if (option == "opt_enabled") {
      this.config.opt_enabled = value;
    }
    if (option == "include_top") {
      this.config.include_top = value;
    }
  }

  getMostFrequentWords() {
    console.log("most frequent called", this.mostFrequentWords);
    return this.mostFrequentWords;
  }

  createTagify(inputElement: HTMLInputElement) {
    if (this.config.use_tagify && !this.tagify) {
      this.tagify = new Tagify(inputElement);
    }
    return this.tagify;
  }

  createTagifyOverride(inputElement: HTMLInputElement) {
    if (this.config.use_tagify) {
      if (!this.tagifyOverride) {
        this.tagifyOverride = new Tagify(this.overrideOutput!);
      }
      this.tagifyOverride.on("click", (e) => {
        console.log(e.detail.data.value);
        this.overrideTopTag(e.detail.data.value);
      });
    }
  }

  async process(input: string) {
    this.outputField.setAttribute("value", "");
    let processedInput = await this.processInput(input);
    console.log("processedinput", processedInput[0]);
    processedInput[0] = processedInput[0] ? processedInput[0] : "";
    this.outputField.setAttribute("value", processedInput[0]);
    return processedInput;
  }

  async processAndAddTags(input: string, outputField: HTMLInputElement) {
    // this.outputField.setAttribute("value", "");
    // if (this.tagify?.DOM?.scope?.parentNode) {
    //   this.tagify.destroy();
    //   console.log("destroyed tagify");
    // }

    let processedInput = await this.processInput(input);
    // let mostFrequentWords = taggy.getMostFrequentWords();
    // this.outputField.setAttribute("value", processedInput[0]);
    // outputField.value = processedInput[0];

    this.addTags(processedInput[0]);

    // // TODO -> modularize
    // if (this.config.use_tagify) {
    //   this.tagify = this.createTagify(outputField);
    //   this.tagify.removeAllTags();
    //   this.tagify.addTags(processedInput[0]);
    // }
    return processedInput[0];
  }

  addTags(input: string) {
    if (input && input != "") {
      // set main tag for tagify
      if (this.config.use_tagify) {
        this.tagify.removeAllTags();
        this.tagify.addTags(input);
      } else {
        this.outputField.setAttribute("value", input);
      }
      // set override tags
      if (this.overrideOutput && this.mostFrequentTopTags) {
        this.addOverrideOutput();
      }
      // set most frequent words
      this.addFrequencyOutput();
    }
  }

  addFrequencyOutput() {
    this.frequencyOutput.innerHTML =
      "Word(s) with most Occurencies: " +
      this.getMostFrequentWords().join(", ");
  }

  addOverrideOutput() {
    let topTags: string[] = [];
    Object.values(this.mostFrequentTopTags).forEach((element) =>
      // topTags.push(element.category + " (" + element.count + ")")
      topTags.push(element.category)
    );
    if (this.overrideOutput) {
      if (this.config.use_tagify && this.tagify) {
        // this.overrideOutput.innerHTML =
        //   "Top detected categories: " + topTags.join(", ");
        this.tagifyOverride.removeAllTags();
        this.tagifyOverride.addTags(topTags);
      } else {
        // this.overrideOutput.innerHTML =
        //   "Top detected categories: " + topTags.join(", ");
      }
    }
  }

  deleteTags() {
    console.log("called deleteTags");
    this.tagify.removeTags();
  }

  tokenize(input: string, type: string = "word"): any[] {
    let tokenizedItems = this.winkTokenizer.tokenize(input);
    let tokenizedWords = tokenizedItems.filter((item) => {
      return item.tag === type;
    });
    return tokenizedWords;
  }

  normalize(inputArray: string[]) {
    let normalizedValues = [];
    for (const element of inputArray) {
      normalizedValues.push(normalizer(element));
    }
    return normalizedValues;
  }

  async processInput(input: string): Promise<string[]> {
    console.log("called processinput");

    let tokenizedWords = this.tokenize(input, "word");

    // filter out german stopwords
    let tokenizedWordsNoStop = tokenizedWords.filter(
      (item) => !this.stopwordsDE.includes(item.value)
    );

    // normalize input (remove umlaute and transform to lowercase)
    let tokenizedValues = [];
    for (const element of tokenizedWordsNoStop) {
      tokenizedValues.push(normalizer(element.value));

      // optional lemmatizer for tech words?
      // lemmatized = jargon.Lemmatize(element.value, stackexchange);
      // console.log(lemmatized.toString());
      // optional lemmatizer for tech words?
    }

    console.log("tokenized and normalized values");
    console.log(tokenizedValues);

    // return if input is too small
    if (tokenizedValues.length < 2) return [];

    let enrichedInputValues: string[] = [];
    this.mostFrequentWords = [];

    // don't call openthesaurus-API too often (-> results in too many requests error)
    if (this.config.opt_enabled && tokenizedValues.length < 20) {
      // get baseforms from openthesaurus?
      for await (const word of tokenizedValues) {
        // enrichedInputValues.push(word);

        console.log("CALLING OPENTHESAURUS API");
        await this.openthesaurus.get(word).then((response: any) => {
          console.log(response);
          let optValues: string[] = [];
          // response.baseforms?
          if (response && response.synsets[0]?.terms) {
            console.log(response.synsets[0]?.terms);

            response.synsets[0].terms.forEach((term: any) => {
              optValues.push(normalizer(term.term));
            });
          }

          console.log("PRE FILTER", optValues);
          // filter out german stopwords
          let optValuesNoStop = optValues.filter(
            (item) => !this.stopwordsDE.includes(item)
          );
          console.log("AFTER FILTER", optValuesNoStop);

          let optValuesTokenized = this.tokenize(
            optValuesNoStop.toString(),
            "word"
          );

          console.log("FINAL FILTER", optValuesTokenized);

          optValuesTokenized.forEach((element) => {
            enrichedInputValues.push(element.value);
          });

          console.log("LOOT", enrichedInputValues);
        });
      }
    }

    // flat out arrays
    enrichedInputValues = enrichedInputValues
      .flat()
      .concat(tokenizedValues.flat());

    console.log("NORMALIZED/ENRICHED INPUTVALUES");
    console.log(enrichedInputValues);

    let glossarTags: string[] = [];
    let combinedWordsReturnSet: string[] = [];

    let inputLowerCase = normalizer(input);

    for (const category of glossarData.tags) {
      // if INCLUDE-TOP is set -> add top tag
      if (this.config.include_top) {
        console.log(category);
        glossarTags.push(normalizer(category.name));
      }

      for (const word of category.words) {
        // normalize input
        glossarTags.push(normalizer(word));

        // check input for "whitespace-words"
        if (word.includes(" ")) {
          if (inputLowerCase.includes(word)) {
            let matchArray = inputLowerCase.matchAll(word);
            for (let match of matchArray) {
              combinedWordsReturnSet.push(match[0]);
              console.log(match[0]);
              console.log("whitespace-word match added", match[0]);
            }
          }
        }
      }
    }

    console.log("WORDS IN GLOSSAR");
    console.log(glossarTags);

    // ASYNC AWAIT OR PROMOISE NEEDED
    // let glossarEnriched = enrichWithOpenThesaurus(glossarTags);
    let glossarEnriched = glossarTags;

    // console.log("GLOSSARENRICHED");
    // console.log(glossarEnriched);

    console.log("ENRICHED INPUTVALUES");
    console.log(enrichedInputValues);

    let returnValues: string[] = [];

    // look for matches in glossar
    for (const glossarValue of glossarEnriched) {
      // console.log("- " + word);

      for (const inputValue of enrichedInputValues) {
        if (inputValue == glossarValue) returnValues.push(inputValue);
      }
      // if (enrichedInputValues.includes(normalizer(word))) {
      //   console.log("-> MATCH");
      //   returnValues.push(word);
      // }
    }

    console.log("COMBINEDWORDSRETURNSET", combinedWordsReturnSet);
    console.log("RETURN VALUES", returnValues);

    // let returnArray: string[] = combinedWordsReturnSet.concat([
    //   sample(returnValues)!,
    // ]);

    let finalSet: string[] = [...combinedWordsReturnSet!].concat(returnValues);

    console.log("FINAL SET", finalSet);
    console.log(finalSet);

    console.log(glossarData.tags);
    let searchGlossar = glossarData.tags;

    let topTagCount: any = [];

    let maxCount = 0;
    // if ASSIGN_TOP is set -> return top categegory
    if (this.config.assign_top) {
      let count = 0;
      searchGlossar.forEach((category: any) => {
        count = 0;
        finalSet.forEach((element) => {
          if (this.normalize(category.words).includes(element)) {
            count += 1;
          }
        });
        topTagCount.push({
          category: category.name,
          count: count,
        });
        if (count > maxCount) maxCount = count;
      });
    }

    console.log("TOPCATFREQ", topTagCount);
    // console.log("SORTBY", sortBy(topTagCount, ["category", "count"]));

    let groupedMostFrequentTopTags = groupBy(topTagCount, "count");

    console.log("GROUPBY", groupedMostFrequentTopTags);
    console.log("LENGHT", Object.keys(groupedMostFrequentTopTags).length);
    console.log("THISSSSSSS", groupedMostFrequentTopTags[maxCount]);
    this.mostFrequentTopTags = groupedMostFrequentTopTags[maxCount];

    // matches with most occurencies
    this.mostFrequentWords = modeArray(finalSet)!;
    console.log("MOSTFREQUENT MODE ARRAY");
    console.log(this.mostFrequentWords);

    let finalValue = sample(this.mostFrequentWords)!;
    console.log("FINALVALUE BEFORE", finalValue);

    // if ASSIGN_TOP is set -> return top categegory
    if (this.config.assign_top) {
      let topTags: string[] = [];
      Object.values(this.mostFrequentTopTags).forEach((element) =>
        // topTags.push(element.category + " (" + element.count + ")")
        topTags.push(element.category)
      );
      let tempValue = sample(topTags);
      if (tempValue) finalValue = tempValue;
    }

    // if (this.config.assign_top) {
    //   searchGlossar.forEach((category: any) => {
    //     console.log(category);
    //     category.words.forEach((word: string) => {
    //       if (normalizer(word) == finalValue) {
    //         console.log("MATCH FOR", category.name);
    //         finalValue = category.name;
    //       }
    //     });
    //   });
    // }
    console.log("FINALVALUE AFTER", finalValue);

    return finalValue ? [finalValue] : [""];

    // console.log(returnValue);
  }
}

function enrichWithOpenThesaurus(inputArray: string[]) {
  let enrichedArray: string[] = [];

  for (const word of inputArray) {
    // get baseforms from openthesaurus?
    openthesaurus.get(word).then((response: any) => {
      if (response && response.baseforms) {
        console.log(response.baseforms);
        enrichedArray.push(response.baseforms);
      }
      // get baseforms from openthesaurus?
    });
  }

  return enrichedArray;
}

// return an array of mode element(s) -> highest occurrences
function modeArray(array: any) {
  if (array.length == 0) return null;
  var modeMap: any = {},
    maxCount = 1,
    modes = [];

  for (var i = 0; i < array.length; i++) {
    var el = array[i];

    if (modeMap[el] == null) modeMap[el] = 1;
    else modeMap[el]++;

    if (modeMap[el] > maxCount) {
      modes = [el];
      maxCount = modeMap[el];
    } else if (modeMap[el] == maxCount) {
      modes.push(el);
      maxCount = modeMap[el];
    }
  }
  return modes;
}
