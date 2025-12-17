import assert from "../assert";
import invokeMap from "lodash/invokeMap.js";
import { maybeAsync } from "../utils/async-helpers.js";

/**
  Collections represent arrays of models. They are returned by a hasMany association, or by one of the ModelClass query methods:

  ```js
  let posts = user.blogPosts;
  let posts = schema.blogPosts.all();
  let posts = schema.blogPosts.find([1, 2, 4]);
  let posts = schema.blogPosts.where({ published: true });
  ```

  Note that there is also a `PolymorphicCollection` class that is identical to `Collection`, except it can contain a heterogeneous array of models. Thus, it has no `modelName` property. This lets serializers and other parts of the system interact with it differently.

  @class Collection
  @constructor
  @public
*/
export default class Collection {
  constructor(modelName, models = []) {
    assert(
      modelName && typeof modelName === "string",
      "You must pass a `modelName` into a Collection"
    );

    /**
      The dasherized model name this Collection represents.

      ```js
      let posts = user.blogPosts;

      posts.modelName; // "blog-post"
      ```

      The model name is separate from the actual models, since Collections can be empty.

      @property modelName
      @type {String}
      @public
    */
    this.modelName = modelName;

    /**
      The underlying plain JavaScript array of Models in this Collection.

      ```js
      posts.models // [ post:1, post:2, ... ]
      ```

      While Collections have many array-ish methods like `filter` and `sort`, it
      can be useful to work with the plain array if you want to work with methods
      like `map`, or use the `[]` accessor.

      For example, in testing you might want to assert against a model from the
      collection:

      ```js
      let newPost = user.posts.models[0].title;

      assert.equal(newPost, "My first post");
      ```

      @property models
      @type {Array}
      @public
    */
    this.models = models;
  }

  /**
    The number of models in the collection.

    ```js
    user.posts.length; // 2
    ```

    @property length
    @type {Integer}
    @public
  */
  get length() {
    return this.models.length;
  }

  /**
     Updates each model in the collection, and immediately persists all changes to the db.

     ```js
     let posts = user.blogPosts;

     posts.update('published', true); // the db was updated for all posts
     ```

     @method update
     @param key
     @param val
     @return this
     @public
   */
  update(...args) {
    invokeMap(this.models, "update", ...args);

    return this;
  }

  /**
     Saves all models in the collection.

     ```js
     let posts = user.blogPosts;

     posts.models[0].published = true;

     posts.save(); // all posts saved to db
     ```

     @method save
     @return this
     @public
   */
  save() {
    invokeMap(this.models, "save");

    return this;
  }

  /**
    Reloads each model in the collection.

    ```js
    let posts = author.blogPosts;

    // ...

    posts.reload(); // reloads data for each post from the db
    ```

    @method reload
    @return this
    @public
  */
  reload() {
    invokeMap(this.models, "reload");

    return this;
  }

  /**
    Destroys the db record for all models in the collection.

    ```js
    let posts = user.blogPosts;

    posts.destroy(); // all posts removed from db
    ```

    @method destroy
    @return this
    @public
  */
  destroy() {
    invokeMap(this.models, "destroy");

    return this;
  }

  /**
    Adds a model to this collection.

    ```js
    posts.length; // 1

    posts.add(newPost);

    posts.length; // 2
    ```

    @method add
    @param {Model} model
    @return this
    @public
  */
  add(model) {
    this.models.push(model);

    return this;
  }

  /**
    Removes a model from this collection.

    ```js
    posts.length; // 5

    let firstPost = posts.models[0];
    posts.remove(firstPost);
    posts.save();

    posts.length; // 4
    ```

    @method remove
    @param {Model} model
    @return this
    @public
  */
  remove(model) {
    let match = this.models.find((m) => m.toString() === model.toString());
    if (match) {
      let i = this.models.indexOf(match);
      this.models.splice(i, 1);
    }

    return this;
  }

  /**
    Checks if the Collection includes the given model.

    ```js
    posts.includes(newPost);
    ```

    Works by checking if the given model name and id exists in the Collection,
    making it a bit more flexible than strict object equality.

    ```js
    let post = server.create('post');
    let programming = server.create('tag', { text: 'Programming' });

    visit(`/posts/${post.id}`);
    click('.tag-selector');
    click('.tag:contains(Programming)');

    post.reload();
    assert.ok(post.tags.includes(programming));
    ```

    @method includes
    @return {Boolean}
    @public
  */
  includes(model) {
    return this.models.some((m) => m.toString() === model.toString());
  }

  /**
    Returns a new Collection with its models filtered according to the provided [callback function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter).

    ```js
    let publishedPosts = user.posts.filter(post => post.isPublished);
    ```
    @method filter
    @param {Function} f
    @return {Collection}
    @public
  */
  filter(f) {
    // Check if function is declared as async
    const isAsync = f.constructor.name === 'AsyncFunction';
    
    if (isAsync) {
      // Async filter: map all promises and filter based on results
      return Promise.all(this.models.map((model, i) => f(model, i, this.models)))
        .then(results => {
          const filteredModels = this.models.filter((_, i) => results[i]);
          return new Collection(this.modelName, filteredModels);
        });
    }
    
    // Sync filter
    let filteredModels = this.models.filter(f);
    return new Collection(this.modelName, filteredModels);
  }

  /**
     Returns a new Collection with its models sorted according to the provided [compare function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#Parameters).

     ```js
     let postsByTitleAsc = user.posts.sort((a, b) => a.title > b.title ? 1 : -1 );
     ```

     @method sort
     @param {Function} f
     @return {Collection}
     @public
   */
  sort(f) {
    // Check if function is declared as async
    const isAsync = f.constructor.name === 'AsyncFunction';
    
    if (isAsync) {
      // Async sort: use a merge sort algorithm that can handle async comparisons
      return this._asyncSort(f).then(sortedModels => {
        return new Collection(this.modelName, sortedModels);
      });
    }
    
    // Sync sort
    let sortedModels = this.models.concat().sort(f);
    return new Collection(this.modelName, sortedModels);
  }

  /**
   * Async-aware merge sort implementation
   * @private
   */
  async _asyncSort(compareFn) {
    if (this.models.length <= 1) {
      return this.models.concat();
    }

    const merge = async (left, right) => {
      const result = [];
      let i = 0, j = 0;

      while (i < left.length && j < right.length) {
        const comparison = await compareFn(left[i], right[j]);
        if (comparison <= 0) {
          result.push(left[i++]);
        } else {
          result.push(right[j++]);
        }
      }

      return result.concat(left.slice(i)).concat(right.slice(j));
    };

    const mergeSort = async (arr) => {
      if (arr.length <= 1) {
        return arr;
      }

      const mid = Math.floor(arr.length / 2);
      const left = await mergeSort(arr.slice(0, mid));
      const right = await mergeSort(arr.slice(mid));
      return await merge(left, right);
    };

    return mergeSort(this.models.concat());
  }

  /**
    Returns a new Collection with a subset of its models selected from `begin` to `end`.

    ```js
    let firstThreePosts = user.posts.slice(0, 3);
    ```

    @method slice
    @param {Integer} begin
    @param {Integer} end
    @return {Collection}
    @public
  */
  slice(...args) {
    let slicedModels = this.models.slice(...args);

    return new Collection(this.modelName, slicedModels);
  }

  /**
    Modifies the Collection by merging the models from another collection.

    ```js
    user.posts.mergeCollection(newPosts);
    user.posts.save();
    ```

    @method mergeCollection
    @param {Collection} collection
    @return this
    @public
   */
  mergeCollection(collection) {
    this.models = this.models.concat(collection.models);

    return this;
  }

  /**
     Simple string representation of the collection and id.

     ```js
     user.posts.toString(); // collection:post(post:1,post:4)
     ```

     @method toString
     @return {String}
     @public
   */
  toString() {
    return `collection:${this.modelName}(${this.models
      .map((m) => m.id)
      .join(",")})`;
  }
}
