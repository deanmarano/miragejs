import {
  createServer,
  Server,
  Model,
  Factory,
  belongsTo,
  hasMany,
  trait,
  association,
} from "@lib";

describe("Unit | Server", function () {
  test("it can be instantiated", () => {
    let server = new Server({ environment: "test" });

    expect(server).toBeTruthy();

    server.shutdown();
  });

  test("routes return pretender handler", () => {
    let server = new Server({ environment: "test" });

    let handler = server.post("foo");

    expect(handler.numberOfCalls).toBe(0);

    server.shutdown();
  });

  test("it runs the default scenario in non-test environments", () => {
    expect.assertions(1);

    let server = new Server({
      environment: "development",
      seeds() {
        expect(true).toBeTruthy();
      },
    });

    server.shutdown();
  });
});

describe("Unit | createServer", function () {
  test("it returns a server instance", async () => {
    let server = createServer();

    expect(server).toBeTruthy();

    server.shutdown();
  });

  test("routes return pretender handler", async () => {
    let server = createServer({ environment: "test" });

    let handler = server.post("foo");

    expect(handler.numberOfCalls).toBe(0);

    server.shutdown();
  });

  test("it runs the default scenario in non-test environments", async () => {
    expect.assertions(1);

    let server = createServer({
      environment: "development",
      seeds() {
        expect(true).toBeTruthy();
      },
    });

    server.shutdown();
  });

  test("forces timing to be 0 in test environment", async () => {
    let server = createServer({ environment: "test" });

    expect(server.timing).toBe(0);

    server.shutdown();
  });

  test("allows setting the timing to 0", async () => {
    let server = createServer({ timing: 0 });

    expect(server.timing).toBe(0);

    server.shutdown();
  });
});

describe("Unit | Server #loadConfig", function () {
  test("forces timing to 0 in test environment", () => {
    let server = new Server({ environment: "test" });

    server.loadConfig(function () {
      this.timing = 50;
    });

    expect(server.timing).toBe(0);

    server.shutdown();
  });

  test("doesn't modify user's timing config in other environments", () => {
    let server = new Server({ environment: "blah" });

    server.loadConfig(function () {
      this.timing = 50;
    });

    expect(server.timing).toBe(50);

    server.shutdown();
  });
});

describe("Unit | Server #db", function () {
  test("its db is isolated across instances", () => {
    let server1 = new Server({ environment: "test" });

    server1.db.createCollection("contacts");
    server1.db.contacts.insert({ name: "Sam" });

    server1.shutdown();

    let server2 = new Server({ environment: "test" });

    expect(server2.contacts).toBeUndefined();

    server2.shutdown();
  });
});

describe("Unit | Server #create", function () {
  test("create fails when no factories or models are registered", () => {
    let server = new Server({ environment: "test" });

    expect(function () {
      server.create("contact");
    }).toThrow(
      "Mirage: You called server.create('contact') but no model or factory was found. Make sure you're passing in the singularized version of the model or factory name."
    );

    server.shutdown();
  });

  test("create fails when an expected factory isn't registered", () => {
    let server = new Server({
      environment: "test",
      factories: {
        address: Factory,
      },
    });

    expect(function () {
      server.create("contact");
    }).toThrow(
      "Mirage: You called server.create('contact') but no model or factory was found. Make sure you're passing in the singularized version of the model or factory name."
    );

    server.shutdown();
  });

  test("create works when models but no factories are registered", () => {
    let server = new Server({
      environment: "test",
      models: {
        contact: Model,
      },
    });

    server.create("contact");

    expect(server.db.contacts).toHaveLength(1);

    server.shutdown();
  });

  test("create adds the data to the db", () => {
    let server = new Server({
      environment: "test",
      factories: {
        contact: Factory.extend({
          name: "Sam",
        }),
      },
    });

    server.create("contact");
    let contactsInDb = server.db.contacts;

    expect(contactsInDb).toHaveLength(1);
    expect(contactsInDb[0]).toEqual({ id: "1", name: "Sam" });

    server.shutdown();
  });

  test("create returns the new data in the db", () => {
    let server = new Server({
      environment: "test",
      factories: {
        contact: Factory.extend({
          name: "Sam",
        }),
      },
    });

    let contact = server.create("contact");

    expect(contact).toEqual({ id: "1", name: "Sam" });

    server.shutdown();
  });

  test("create allows for attr overrides", () => {
    let server = new Server({
      environment: "test",
      factories: {
        contact: Factory.extend({
          name: "Sam",
        }),
      },
    });

    let sam = server.create("contact");
    let link = server.create("contact", { name: "Link" });

    expect(sam).toEqual({ id: "1", name: "Sam" });
    expect(link).toEqual({ id: "2", name: "Link" });

    server.shutdown();
  });

  test("create allows for attr overrides with extended factories", () => {
    let ContactFactory = Factory.extend({
      name: "Link",
      age: 500,
    });
    let FriendFactory = ContactFactory.extend({
      is_young() {
        return this.age < 18;
      },
    });

    let server = new Server({
      environment: "test",
      factories: {
        contact: ContactFactory,
        friend: FriendFactory,
      },
    });

    let link = server.create("friend");
    let youngLink = server.create("friend", { age: 10 });

    expect(link).toEqual({ id: "1", name: "Link", age: 500, is_young: false });
    expect(youngLink).toEqual({
      id: "2",
      name: "Link",
      age: 10,
      is_young: true,
    });

    server.shutdown();
  });

  test("create allows for attr overrides with arrays", () => {
    let server = new Server({
      environment: "test",
      factories: {
        contact: Factory.extend({
          name: ["Sam", "Carl"],
        }),
      },
    });

    let sam = server.create("contact");
    let link = server.create("contact", { name: ["Link"] });
    let noname = server.create("contact", { name: [] });

    expect(sam).toEqual({ id: "1", name: ["Sam", "Carl"] });
    expect(link).toEqual({ id: "2", name: ["Link"] });
    expect(noname).toEqual({ id: "3", name: [] });

    server.shutdown();
  });

  test("create allows for nested attr overrides", () => {
    let server = new Server({
      environment: "test",
      factories: {
        contact: Factory.extend({
          address: {
            streetName: "Main",
            streetAddress(i) {
              return 1000 + i;
            },
          },
        }),
      },
    });

    let contact1 = server.create("contact");
    let contact2 = server.create("contact");

    expect(contact1).toEqual({
      id: "1",
      address: { streetName: "Main", streetAddress: 1000 },
    });
    expect(contact2).toEqual({
      id: "2",
      address: { streetName: "Main", streetAddress: 1001 },
    });

    server.shutdown();
  });

  test("factories can have dynamic properties that depend on attr overrides", () => {
    let server = new Server({
      environment: "test",
      factories: {
        baz: Factory.extend({
          bar() {
            return this.name.substr(1);
          },
        }),
      },
    });

    let baz1 = server.create("baz", { name: "foo" });

    expect(baz1).toEqual({ id: "1", name: "foo", bar: "oo" });

    server.shutdown();
  });

  test("create allows for arrays of attr overrides", () => {
    let server = new Server({
      environment: "test",
      factories: {
        contact: Factory.extend({
          websites: [
            "http://example.com",
            function (i) {
              return `http://placekitten.com/${320 + i}/${240 + i}`;
            },
          ],
        }),
      },
    });

    let contact1 = server.create("contact");
    let contact2 = server.create("contact");

    expect(contact1).toEqual({
      id: "1",
      websites: ["http://example.com", "http://placekitten.com/320/240"],
    });
    expect(contact2).toEqual({
      id: "2",
      websites: ["http://example.com", "http://placekitten.com/321/241"],
    });

    server.shutdown();
  });

  test("create allows to extend factory with trait", () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),
    });

    let server = new Server({
      environment: "test",
      factories: {
        article: ArticleFactory,
      },
    });

    let article = server.create("article");
    let publishedArticle = server.create("article", "published");

    expect(article).toEqual({ id: "1", title: "Lorem ipsum" });
    expect(publishedArticle).toEqual({
      id: "2",
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2010-01-01 10:00:00",
    });

    server.shutdown();
  });

  test("create allows to extend factory with multiple traits", () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),

      withContent: trait({
        content: "content",
      }),
    });

    let server = new Server({
      environment: "test",
      factories: {
        article: ArticleFactory,
      },
    });

    let article = server.create("article");
    let publishedArticle = server.create("article", "published");
    let publishedArticleWithContent = server.create(
      "article",
      "published",
      "withContent"
    );

    expect(article).toEqual({ id: "1", title: "Lorem ipsum" });
    expect(publishedArticle).toEqual({
      id: "2",
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2010-01-01 10:00:00",
    });
    expect(publishedArticleWithContent).toEqual({
      id: "3",
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2010-01-01 10:00:00",
      content: "content",
    });

    server.shutdown();
  });

  test("create allows to extend factory with traits containing afterCreate callbacks", () => {
    let CommentFactory = Factory.extend({
      content: "content",
    });
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      withComments: trait({
        afterCreate(article, server) {
          server.createList("comment", 3, { article });
        },
      }),
    });

    let server = new Server({
      environment: "test",
      factories: {
        article: ArticleFactory,
        comment: CommentFactory,
      },
    });

    let articleWithComments = server.create("article", "withComments");

    expect(articleWithComments).toEqual({ id: "1", title: "Lorem ipsum" });
    expect(server.db.comments).toHaveLength(3);

    server.shutdown();
  });

  test("create does not execute afterCreate callbacks from traits that are not applied", () => {
    let CommentFactory = Factory.extend({
      content: "content",
    });
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      withComments: trait({
        afterCreate(article, server) {
          server.createList("comment", 3, { article });
        },
      }),
    });

    let server = new Server({
      environment: "test",
      factories: {
        article: ArticleFactory,
        comment: CommentFactory,
      },
    });

    let articleWithComments = server.create("article");

    expect(articleWithComments).toEqual({ id: "1", title: "Lorem ipsum" });
    expect(server.db.comments).toHaveLength(0);

    server.shutdown();
  });

  test("create allows to extend with multiple traits and to apply attr overrides", () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),

      withContent: trait({
        content: "content",
      }),
    });

    let server = new Server({
      environment: "test",
      factories: {
        article: ArticleFactory,
      },
    });

    let overrides = {
      publishedAt: "2012-01-01 10:00:00",
    };
    let publishedArticleWithContent = server.create(
      "article",
      "published",
      "withContent",
      overrides
    );

    expect(publishedArticleWithContent).toEqual({
      id: "1",
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2012-01-01 10:00:00",
      content: "content",
    });

    server.shutdown();
  });

  test("create handles async afterCreate callbacks", async () => {
    let CommentFactory = Factory.extend({
      content: "content",
    });
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      withComments: trait({
        async afterCreate(article, server) {
          await server.createList("comment", 3, { article });
        },
      }),
    });

    let server = new Server({
      environment: "test",
      factories: {
        article: ArticleFactory,
        comment: CommentFactory,
      },
    });

    let articleWithComments = await server.create("article", "withComments");

    expect(articleWithComments).toEqual({ id: "1", title: "Lorem ipsum" });
    expect(server.db.comments).toHaveLength(3);

    server.shutdown();
  });

  test("create uses return value from async afterCreate when model is returned", async () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",
      status: "draft",

      async afterCreate(article, server) {
        // Simulate async operation that modifies and returns the model
        await new Promise((resolve) => setTimeout(resolve, 1));
        article.status = "published";
        return article;
      },
    });

    let server = new Server({
      environment: "test",
      factories: {
        article: ArticleFactory,
      },
    });

    let article = await server.create("article");

    expect(article).toEqual({
      id: "1",
      title: "Lorem ipsum",
      status: "published",
    });

    server.shutdown();
  });

  test("create uses return value from async afterCreate in trait when model is returned", async () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",
      status: "draft",

      published: trait({
        async afterCreate(article, server) {
          await new Promise((resolve) => setTimeout(resolve, 1));
          article.status = "published";
          article.publishedAt = "2024-01-01";
          return article;
        },
      }),
    });

    let server = new Server({
      environment: "test",
      factories: {
        article: ArticleFactory,
      },
    });

    let article = await server.create("article", "published");

    expect(article).toEqual({
      id: "1",
      title: "Lorem ipsum",
      status: "published",
      publishedAt: "2024-01-01",
    });

    server.shutdown();
  });

  test("create handles sync afterCreate callbacks that return models", async () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",
      status: "draft",

      afterCreate(article, server) {
        article.status = "modified";
        return article;
      },
    });

    let server = new Server({
      environment: "test",
      factories: {
        article: ArticleFactory,
      },
    });

    let article = await server.create("article");

    expect(article).toEqual({
      id: "1",
      title: "Lorem ipsum",
      status: "modified",
    });

    server.shutdown();
  });

  test("create handles multiple async afterCreate callbacks in order", async () => {
    let executionOrder = [];
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",
      count: 0,

      firstTrait: trait({
        async afterCreate(article, server) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          executionOrder.push("first");
          article.count = article.count + 1;
          return article;
        },
      }),

      secondTrait: trait({
        async afterCreate(article, server) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          executionOrder.push("second");
          article.count = article.count + 10;
          return article;
        },
      }),

      async afterCreate(article, server) {
        executionOrder.push("base");
        article.count = article.count + 100;
        return article;
      },
    });

    let server = new Server({
      environment: "test",
      factories: {
        article: ArticleFactory,
      },
    });

    let article = await server.create("article", "firstTrait", "secondTrait");

    // Base afterCreate runs first, then trait callbacks in order
    expect(executionOrder).toEqual(["base", "first", "second"]);
    expect(article.count).toBe(111);

    server.shutdown();
  });

  test("destructuring properties from created model works correctly", async () => {
    let UserFactory = Factory.extend({
      username: "testuser",
      email: "test@example.com",
    });

    let server = new Server({
      environment: "test",
      models: {
        user: Model,
      },
      factories: {
        user: UserFactory,
      },
    });

    let user = await server.create("user");
    let { id, username } = user;

    // Properties should be actual values, not Promises
    expect(typeof id).toBe("string");
    expect(typeof username).toBe("string");
    expect(username).toBe("testuser");
    expect(`Admin Users ${username}`).toBe("Admin Users testuser");

    server.shutdown();
  });

  test("async factory property functions are awaited during create", async () => {
    let UserFactory = Factory.extend({
      username: async (i) => {
        // Simulate async operation like calling chance.first()
        return Promise.resolve(`user_${i + 1}`);
      },
      email() {
        return `${this.username}@example.com`;
      },
    });

    let server = new Server({
      environment: "test",
      models: {
        user: Model,
      },
      factories: {
        user: UserFactory,
      },
    });

    let user = await server.create("user");
    let { id, username } = user;

    // Properties from async functions should be resolved values, not Promises
    expect(typeof username).toBe("string");
    expect(username).toBe("user_1");
    expect(username).not.toContain("[object Promise]");
    expect(`Admin Users ${username}`).toBe("Admin Users user_1");

    server.shutdown();
  });

  test("GET route handler returns 404 when model not found instead of undefined", async () => {
    // Reproduce scenario where a GET request for a non-existent model
    // returns undefined, causing serializer errors in JSON API apps
    // Atlas error: "Cannot read properties of undefined (reading 'id')"
    // at WorkspaceV2Serializer.normalizeQueryRecordResponse
    let Workspace = Model.extend({});
    
    let WorkspaceFactory = Factory.extend({
      name: "workspace-1",
    });

    let server = new Server({
      environment: "test",
      models: {
        workspace: Workspace,
      },
      factories: {
        workspace: WorkspaceFactory,
      },
    });

    // Create a workspace with id 1
    await server.create("workspace");

    // Define a GET route handler
    server.get("/workspaces/:id", function(schema, request) {
      // schema.find() returns null when model doesn't exist
      return schema.workspaces.find(request.params.id);
    });

    // Make a GET request for a non-existent workspace
    let response = await fetch("/workspaces/999");
    
    // EXPECTED: When a model isn't found, mirage should return 404
    // ACTUAL: Returns 200 with null/undefined body, causing serializer to crash
    // This causes "Cannot read properties of undefined (reading 'id')" in Atlas
    expect(response.status).toBe(404);

    server.shutdown();
  });

  test("Factory afterCreate without await causes relationship to be null", async () => {
    // Reproduce Atlas timeout issue where factory afterCreate creates a related model
    // without await and passes the Promise to model.update()
    // 
    // Atlas error: "You're trying to create a data-retention-policy-dont-delete-v2 model 
    // and you passed in '[object Promise]' under the target key, but that key is 
    // a BelongsTo relationship. You must pass in a Model or null."
    //
    // This happens when:
    // 1. afterCreate calls server.create() without await
    // 2. afterCreate calls model.update() without await
    // 3. The Promise never resolves, leaving the relationship null/undefined
    // 4. Later code tries to access properties on the null relationship → crash
    
    let Workspace = Model.extend({});
    let Policy = Model.extend({
      target: belongsTo('workspace')
    });
    
    let WorkspaceFactory = Factory.extend({
      name: "workspace-1",
    });
    
    let PolicyFactory = Factory.extend({
      name: "policy-1",
      afterCreate(policy, server) {
        // BUG: Not awaiting server.create() - returns Promise
        const workspace = server.create('workspace', { name: 'target-workspace' });
        // BUG: Not awaiting policy.update() - update doesn't complete
        policy.update({ target: workspace });
        // afterCreate returns, but the async operations haven't finished
      }
    });

    let server = new Server({
      environment: "test",
      models: {
        workspace: Workspace,
        policy: Policy,
      },
      factories: {
        workspace: WorkspaceFactory,
        policy: PolicyFactory,
      },
    });

    // Create the policy with broken afterCreate
    const policy = await server.create("policy");
    
    // BUG REVEALED: target is null because afterCreate's update() never completed
    // In Atlas, this causes "Cannot set properties of undefined (setting 'categories')"
    // when route handlers try to access relationships that are unexpectedly null
    const target = policy.target;
    
    // EXPECTED: target should be a Workspace model
    // ACTUAL: target is null because the Promise chain wasn't awaited
    expect(target).toBeNull(); // This is the bug - it's null when it shouldn't be

    server.shutdown();
    
    // Now test with properly async afterCreate (as the codemod would fix it)
    let PolicyFactoryFixed = Factory.extend({
      name: "policy-1",
      async afterCreate(policy, server) {
        // FIXED: Properly awaiting async operations
        const workspace = await server.create('workspace', { name: 'target-workspace' });
        await policy.update({ target: workspace });
        return policy;
      }
    });

    let serverFixed = new Server({
      environment: "test",
      models: {
        workspace: Workspace,
        policy: Policy,
      },
      factories: {
        workspace: WorkspaceFactory,
        policy: PolicyFactoryFixed,
      },
    });

    // Create the policy with fixed afterCreate
    const policyFixed = await serverFixed.create("policy");
    const targetFixed = policyFixed.target;
    
    // NOW IT WORKS: target is properly set
    expect(targetFixed).not.toBeNull();
    expect(targetFixed.name).toBe('target-workspace');

    serverFixed.shutdown();
  });

  test("GET route handler that returns model created without await should fail", async () => {
    // Reproduce Atlas issue where GET request handler creates a model
    // without await and returns undefined because the Promise isn't awaited
    let Workspace = Model.extend({});
    
    let WorkspaceFactory = Factory.extend({
      name: "workspace-1",
    });

    let server = new Server({
      environment: "test",
      models: {
        workspace: Workspace,
      },
      factories: {
        workspace: WorkspaceFactory,
      },
    });

    // Define a GET route handler that creates and returns a model without await
    server.get("/workspaces/new", function(schema, request) {
      // BUG: Creating a model but not awaiting it!
      // The route handler is synchronous but server.create() returns a Promise
      let workspace = server.create("workspace");
      return workspace;  // This returns a Promise, not a model!
    });

    // Make a GET request
    let response = await fetch("/workspaces/new");
    
    // This should fail because the response is a Promise, not a serialized model
    // The serializer will try to access workspace.id but workspace is a Promise
    try {
      let json = await response.json();
      // If we got here, the json might be empty or have [object Promise]
      console.log("JSON:", json);
      // The issue is that json.workspace might be undefined or a stringified Promise
      expect(json.workspace).toBeDefined();
      expect(json.workspace.id).toBeDefined(); // This should fail
    } catch (error) {
      // Expected - serializer should fail or response should be invalid
      expect(error).toBeDefined();
    }

    server.shutdown();
  });

  test("GET route handler returns resolved model not Promise when handler function is sync", async () => {
    // Reproduce Atlas issue where GET request returns undefined
    // because the route handler returns a Promise instead of awaiting it
    let Workspace = Model.extend({});
    
    let WorkspaceFactory = Factory.extend({
      name: "workspace-1",
    });

    let server = new Server({
      environment: "test",
      models: {
        workspace: Workspace,
      },
      factories: {
        workspace: WorkspaceFactory,
      },
    });

    // Create a workspace
    let workspace = await server.create("workspace");
    let workspaceId = workspace.id;

    // Define a GET route handler that returns server.schema.find() without await
    // This is a common mistake when migrating to async
    server.get("/workspaces/:id", function(schema, request) {
      // BUG: Not awaiting the Promise!
      // Since schema methods might return Promises in async mode
      return schema.workspaces.find(request.params.id);
    });

    // Make a GET request - should return the workspace data
    let response = await fetch("/workspaces/" + workspaceId);
    let json = await response.json();
    
    // The response should have the workspace data
    expect(json.workspace).toBeDefined();
    expect(json.workspace.id).toBe(workspaceId);
    expect(json.workspace.name).toBe("workspace-1");

    server.shutdown();
  });

  test("model.update() with unawaited server.create() for association auto-awaits the Promise", async () => {
    // Reproduce the Atlas bug where afterCreate calls:
    //   model.update({ association: server.create('related') })
    // Without await, server.create() returns a Promise.
    // Model.update() should detect this and auto-await it.
    
    let Organization = Model.extend({});
    
    let FeatureSet = Model.extend({});
    
    let Subscription = Model.extend({
      organization: belongsTo(),
      featureSet: belongsTo(),
    });
    
    let FeatureSetFactory = Factory.extend({
      name: 'Standard',
    });
    
    let SubscriptionFactory = Factory.extend({
      async afterCreate(subscription, server) {
        // Missing await before server.create()!
        // Model.update() should auto-await the Promise
        await subscription.update({
          featureSet: server.create('featureSet'),  // <-- Missing await, returns Promise
        });
        return subscription;
      },
    });
    
    let OrganizationFactory = Factory.extend({
      name: 'Test Org',
      async afterCreate(organization, server) {
        await server.create('subscription', { organization });
        return organization;
      },
    });

    let server = new Server({
      environment: "test",
      models: {
        organization: Organization,
        subscription: Subscription,
        featureSet: FeatureSet,
      },
      factories: {
        organization: OrganizationFactory,
        subscription: SubscriptionFactory,
        featureSet: FeatureSetFactory,
      },
    });

    // This should work now - update() will auto-await the Promise
    let org = await server.create("organization");
    expect(org.name).toBe("Test Org");
    
    // Check that the subscription was created with the feature set
    let subscriptions = server.schema.subscriptions.all();
    expect(subscriptions.length).toBe(1);
    let subscription = subscriptions.models[0];
    expect(subscription.featureSet).toBeDefined();
    expect(subscription.featureSet.name).toBe("Standard");

    server.shutdown();
  });

  test("model methods are available when updating associations in nested afterCreate with async factories", async () => {
    // Reproduce the Atlas scenario more accurately:
    // - organization-v2 has hasMany teams
    // - team-v2 has belongsTo organization
    // - team-v2 has async properties
    // - team-v2 afterCreate creates a member and updates it
    
    let Organization = Model.extend({
      teams: hasMany('team'),
    });
    
    let Team = Model.extend({
      organization: belongsTo(),
    });
    
    let Member = Model.extend({});
    
    let MemberFactory = Factory.extend({
      memberId: (i) => `member-${i}`,
    });

    let TeamFactory = Factory.extend({
      name: async (i) => {
        return Promise.resolve(`Team ${i + 1}`);
      },
      async afterCreate(team, server) {
        // Create and update a member
        let member = await server.create('member', {
          memberId: team.id,
        });
        member.update({ memberName: team.name });
        
        return team;
      },
    });
    
    let OrganizationFactory = Factory.extend({
      name: 'Test Org',
    });

    let server = new Server({
      environment: "test",
      models: {
        organization: Organization,
        team: Team,
        member: Member,
      },
      factories: {
        organization: OrganizationFactory,
        team: TeamFactory,
        member: MemberFactory,
      },
    });

    // Create organization with a team (which has async properties and nested creation)
    let org = await server.create("organization");
    let team = await server.create("team", { organization: org });

    // The team should be created successfully
    expect(team.name).toBe("Team 1");
    expect(typeof team.hasInverseFor).toBe("function");
    
    // The org should have the team in its collection
    expect(org.teams.models.length).toBe(1);

    server.shutdown();
  });

  test("model.update() works correctly in nested afterCreate with async factory properties", async () => {
    // Simulate the Atlas scenario: 
    // - team-v2 factory has async properties (name, ssoTeamId)
    // - team-v2 afterCreate creates a member-role-v2
    // - member-role-v2 might call update() on associations
    
    let MemberFactory = Factory.extend({
      memberId: (i) => `member-${i}`,
      memberName: (i) => `Member ${i}`,
    });

    let TeamFactory = Factory.extend({
      name: async (i) => {
        return Promise.resolve(`Team ${i + 1}`);
      },
      async afterCreate(team, server) {
        // Create a member in afterCreate
        let member = await server.create('member', {
          memberId: team.id,
          memberName: team.name,
        });
        
        // Try to update it (this is what happens in some Atlas scenarios)
        member.update({ memberType: 'groups' });
        
        return team;
      },
    });

    let server = new Server({
      environment: "test",
      models: {
        team: Model,
        member: Model,
      },
      factories: {
        team: TeamFactory,
        member: MemberFactory,
      },
    });

    let team = await server.create("team");

    // The team should be created successfully with its async name
    expect(team.name).toBe("Team 1");
    expect(typeof team.hasInverseFor).toBe("function");

    server.shutdown();
  });

  test("model.update() works correctly in afterCreate with async factory properties", async () => {
    let UserFactory = Factory.extend({
      username: async (i) => {
        return Promise.resolve(`user_${i + 1}`);
      },
      afterCreate(user) {
        // This is a common pattern - updating the model in afterCreate
        user.update({ username: `updated_${user.username}` });
        return user;
      },
    });

    let server = new Server({
      environment: "test",
      models: {
        user: Model,
      },
      factories: {
        user: UserFactory,
      },
    });

    let user = await server.create("user");

    // The model should have been updated in afterCreate
    expect(user.username).toBe("updated_user_1");
    expect(typeof user.hasInverseFor).toBe("function");

    server.shutdown();
  });

  test("create throws errors when using trait that is not defined and distinquishes between traits and non-traits", async () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),

      private: {
        someAttr: "value",
      },
    });

    let server = new Server({
      environment: "test",
      factories: {
        article: ArticleFactory,
      },
    });

    await expect(async () => {
      await server.create("article", "private");
    }).rejects.toThrow("'private' trait is not registered in 'article' factory");

    server.shutdown();
  });

  test("create allows to create objects with associations", () => {
    let AuthorFactory = Factory.extend({
      name: "Sam",
    });
    let CategoryFactory = Factory.extend({
      name: "splendid software",
    });
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      withCategory: trait({
        awesomeCategory: association(),
      }),

      author: association(),
    });

    let server = new Server({
      environment: "test",
      models: {
        author: Model.extend({
          articles: hasMany(),
        }),
        category: Model.extend({}),
        article: Model.extend({
          author: belongsTo(),
          awesomeCategory: belongsTo("category"),
        }),
      },
      factories: {
        article: ArticleFactory,
        author: AuthorFactory,
        category: CategoryFactory,
      },
    });

    let article = server.create("article", "withCategory");

    expect(article.attrs).toEqual({
      title: "Lorem ipsum",
      id: "1",
      authorId: "1",
      awesomeCategoryId: "1",
    });
    expect(server.db.authors).toHaveLength(1);
    expect(server.db.categories).toHaveLength(1);

    let anotherArticle = server.create("article", "withCategory");
    expect(anotherArticle.attrs).toEqual({
      title: "Lorem ipsum",
      id: "2",
      authorId: "2",
      awesomeCategoryId: "2",
    });
    expect(server.db.authors).toHaveLength(2);
    expect(server.db.categories).toHaveLength(2);

    server.shutdown();
  });

  test("create allows to create objects with associations with traits and overrides for associations", () => {
    let CategoryFactory = Factory.extend({
      name: "splendid software",

      published: trait({
        isPublished: true,
        publishedAt: "2014-01-01 10:00:00",
      }),
    });
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      withCategory: trait({
        category: association("published", {
          publishedAt: "2016-01-01 12:00:00",
        }),
      }),
    });

    let server = new Server({
      environment: "test",
      factories: {
        article: ArticleFactory,
        category: CategoryFactory,
      },
      models: {
        category: Model.extend({}),
        article: Model.extend({
          category: belongsTo("category"),
        }),
      },
    });

    let article = server.create("article", "withCategory");

    expect(article.attrs).toEqual({
      title: "Lorem ipsum",
      id: "1",
      categoryId: "1",
    });
    expect(server.db.categories).toHaveLength(1);
    expect(server.db.categories[0]).toEqual({
      name: "splendid software",
      id: "1",
      isPublished: true,
      publishedAt: "2016-01-01 12:00:00",
    });

    server.shutdown();
  });

  test("create does not create (extra) models on associations when they are passed in as overrides", () => {
    let MotherFactory = Factory.extend({
      name: "Should not create",
    });
    let ChildFactory = Factory.extend({
      mother: association(),
    });

    let server = new Server({
      environment: "test",
      factories: {
        mother: MotherFactory,
        child: ChildFactory,
      },
      models: {
        mother: Model.extend({
          children: hasMany("child"),
        }),
        child: Model.extend({
          mother: belongsTo("mother"),
        }),
      },
    });

    let mother = server.create("mother", { name: "Lynda" });
    server.create("child", { name: "Don", mother });
    server.create("child", { name: "Dan", mother });

    expect(server.db.mothers).toHaveLength(1);

    server.shutdown();
  });
});

describe("Unit | Server #createList", function () {
  let server = null;
  beforeEach(function () {
    server = new Server({ environment: "test" });
  });

  afterEach(function () {
    server.shutdown();
  });

  test("createList adds the given number of elements to the db", () => {
    server.loadFactories({
      contact: Factory.extend({ name: "Sam" }),
    });

    server.createList("contact", 3);
    let contactsInDb = server.db.contacts;

    expect(contactsInDb).toHaveLength(3);
    expect(contactsInDb[0]).toEqual({ id: "1", name: "Sam" });
    expect(contactsInDb[1]).toEqual({ id: "2", name: "Sam" });
    expect(contactsInDb[2]).toEqual({ id: "3", name: "Sam" });
  });

  test("createList returns the created elements", () => {
    server.loadFactories({
      contact: Factory.extend({ name: "Sam" }),
    });

    server.create("contact");
    let contacts = server.createList("contact", 3);

    expect(contacts).toHaveLength(3);
    expect(contacts[0]).toEqual({ id: "2", name: "Sam" });
    expect(contacts[1]).toEqual({ id: "3", name: "Sam" });
    expect(contacts[2]).toEqual({ id: "4", name: "Sam" });
  });

  test("createList respects sequences", () => {
    server.loadFactories({
      contact: Factory.extend({
        name(i) {
          return `name${i}`;
        },
      }),
    });

    let contacts = server.createList("contact", 3);

    expect(contacts[0]).toEqual({ id: "1", name: "name0" });
    expect(contacts[1]).toEqual({ id: "2", name: "name1" });
    expect(contacts[2]).toEqual({ id: "3", name: "name2" });
  });

  test("createList respects attr overrides", () => {
    server.loadFactories({
      contact: Factory.extend({ name: "Sam" }),
    });

    let sams = server.createList("contact", 2);
    let links = server.createList("contact", 2, { name: "Link" });

    expect(sams[0]).toEqual({ id: "1", name: "Sam" });
    expect(sams[1]).toEqual({ id: "2", name: "Sam" });
    expect(links[0]).toEqual({ id: "3", name: "Link" });
    expect(links[1]).toEqual({ id: "4", name: "Link" });
  });

  test("createList respects traits", () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),

      withContent: trait({
        content: "content",
      }),
    });

    server.loadFactories({
      article: ArticleFactory,
    });

    let articles = server.createList("article", 2, "published", "withContent");

    expect(articles[0]).toEqual({
      id: "1",
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2010-01-01 10:00:00",
      content: "content",
    });
    expect(articles[1]).toEqual({
      id: "2",
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2010-01-01 10:00:00",
      content: "content",
    });
  });

  test("createList respects traits with attr overrides", () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),

      withContent: trait({
        content: "content",
      }),
    });

    server.loadFactories({
      article: ArticleFactory,
    });

    let overrides = { publishedAt: "2012-01-01 10:00:00" };
    let articles = server.createList(
      "article",
      2,
      "published",
      "withContent",
      overrides
    );

    expect(articles[0]).toEqual({
      id: "1",
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2012-01-01 10:00:00",
      content: "content",
    });
    expect(articles[1]).toEqual({
      id: "2",
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2012-01-01 10:00:00",
      content: "content",
    });
  });

  test("createList throws errors when using trait that is not defined and distinquishes between traits and non-traits", async () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),

      private: {
        someAttr: "value",
      },
    });

    server.loadFactories({
      article: ArticleFactory,
    });

    await expect(async () => {
      await server.createList("article", 2, "private");
    }).rejects.toThrow("'private' trait is not registered in 'article' factory");
  });

  test("createList throws an error if the second argument is not an integer", async () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),
    });

    server.loadFactories({
      article: ArticleFactory,
    });

    await expect(async () => {
      await server.createList("article", "published");
    }).rejects.toThrow(
      "Mirage: second argument has to be an integer, you passed: string"
    );
  });
});

describe("Unit | Server #build", function () {
  let server = null;
  beforeEach(function () {
    server = new Server({ environment: "test" });
  });

  afterEach(function () {
    server.shutdown();
  });

  test("build does not add the data to the db", () => {
    server.loadFactories({
      contact: Factory.extend({ name: "Sam" }),
    });

    server.build("contact");
    let contactsInDb = server.db.contacts;

    expect(contactsInDb).toHaveLength(0);
  });

  test("build returns the new attrs with no id", () => {
    server.loadFactories({
      contact: Factory.extend({ name: "Sam" }),
    });

    let contact = server.build("contact");

    expect(contact).toEqual({ name: "Sam" });
  });

  test("build allows for attr overrides", () => {
    server.loadFactories({
      contact: Factory.extend({ name: "Sam" }),
    });

    let sam = server.build("contact");
    let link = server.build("contact", { name: "Link" });

    expect(sam).toEqual({ name: "Sam" });
    expect(link).toEqual({ name: "Link" });
  });

  test("build allows for attr overrides with extended factories", () => {
    let ContactFactory = Factory.extend({
      name: "Link",
      age: 500,
    });
    let FriendFactory = ContactFactory.extend({
      is_young() {
        return this.age < 18;
      },
    });
    server.loadFactories({
      contact: ContactFactory,
      friend: FriendFactory,
    });

    let link = server.build("friend");
    let youngLink = server.build("friend", { age: 10 });

    expect(link).toEqual({ name: "Link", age: 500, is_young: false });
    expect(youngLink).toEqual({ name: "Link", age: 10, is_young: true });
  });

  test("build allows for attr overrides with arrays", () => {
    server.loadFactories({
      contact: Factory.extend({ name: ["Sam", "Carl"] }),
    });

    let sam = server.build("contact");
    let link = server.build("contact", { name: ["Link"] });
    let noname = server.build("contact", { name: [] });

    expect(sam).toEqual({ name: ["Sam", "Carl"] });
    expect(link).toEqual({ name: ["Link"] });
    expect(noname).toEqual({ name: [] });
  });

  test("build allows for nested attr overrides", () => {
    server.loadFactories({
      contact: Factory.extend({
        address: {
          streetName: "Main",
          streetAddress(i) {
            return 1000 + i;
          },
        },
      }),
    });

    let contact1 = server.build("contact");
    let contact2 = server.build("contact");

    expect(contact1).toEqual({
      address: { streetName: "Main", streetAddress: 1000 },
    });
    expect(contact2).toEqual({
      address: { streetName: "Main", streetAddress: 1001 },
    });
  });

  test("build allows for arrays of attr overrides", () => {
    server.loadFactories({
      contact: Factory.extend({
        websites: [
          "http://example.com",
          function (i) {
            return `http://placekitten.com/${320 + i}/${240 + i}`;
          },
        ],
      }),
    });

    let contact1 = server.build("contact");
    let contact2 = server.build("contact");

    expect(contact1).toEqual({
      websites: ["http://example.com", "http://placekitten.com/320/240"],
    });
    expect(contact2).toEqual({
      websites: ["http://example.com", "http://placekitten.com/321/241"],
    });
  });

  test("build allows to extend factory with trait", () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),
    });

    server.loadFactories({
      article: ArticleFactory,
    });

    let article = server.build("article");
    let publishedArticle = server.build("article", "published");

    expect(article).toEqual({ title: "Lorem ipsum" });
    expect(publishedArticle).toEqual({
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2010-01-01 10:00:00",
    });
  });

  test("build allows to extend factory with multiple traits", () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),

      withContent: trait({
        content: "content",
      }),
    });

    server.loadFactories({
      article: ArticleFactory,
    });

    let article = server.build("article");
    let publishedArticle = server.build("article", "published");
    let publishedArticleWithContent = server.build(
      "article",
      "published",
      "withContent"
    );

    expect(article).toEqual({ title: "Lorem ipsum" });
    expect(publishedArticle).toEqual({
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2010-01-01 10:00:00",
    });
    expect(publishedArticleWithContent).toEqual({
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2010-01-01 10:00:00",
      content: "content",
    });
  });

  test("build allows to extend with multiple traits and to apply attr overrides", () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),

      withContent: trait({
        content: "content",
      }),
    });

    server.loadFactories({
      article: ArticleFactory,
    });

    let overrides = {
      publishedAt: "2012-01-01 10:00:00",
    };
    let publishedArticleWithContent = server.build(
      "article",
      "published",
      "withContent",
      overrides
    );

    expect(publishedArticleWithContent).toEqual({
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2012-01-01 10:00:00",
      content: "content",
    });
  });

  test("build allows to build objects with associations", () => {
    let AuthorFactory = Factory.extend({
      name: "Yehuda",
    });
    let CategoryFactory = Factory.extend({
      name: "splendid software",
    });
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      withCategory: trait({
        awesomeCategory: association(),
      }),

      someOtherTrait: trait({
        user: association(),
      }),

      author: association(),
    });

    server.loadFactories({
      article: ArticleFactory,
      author: AuthorFactory,
      category: CategoryFactory,
    });
    server.schema.registerModels({
      author: Model.extend({
        articles: hasMany(),
      }),
      category: Model.extend({}),
      article: Model.extend({
        author: belongsTo(),
        awesomeCategory: belongsTo("category"),
      }),
    });

    let article = server.build("article", "withCategory");

    expect(article).toEqual({
      title: "Lorem ipsum",
      authorId: "1",
      awesomeCategoryId: "1",
    });
    expect(server.db.authors).toHaveLength(1);
    expect(server.db.categories).toHaveLength(1);
  });

  test("build allows to build objects with associations with traits and overrides for associations", () => {
    let CategoryFactory = Factory.extend({
      name: "splendid software",

      published: trait({
        isPublished: true,
        publishedAt: "2014-01-01 10:00:00",
      }),
    });
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      withCategory: trait({
        category: association("published", {
          publishedAt: "2016-01-01 12:00:00",
        }),
      }),
    });

    server.config({
      factories: {
        article: ArticleFactory,
        category: CategoryFactory,
      },
      models: {
        category: Model.extend({}),
        article: Model.extend({
          category: belongsTo(),
        }),
      },
    });

    let article = server.build("article", "withCategory");

    expect(article).toEqual({ title: "Lorem ipsum", categoryId: "1" });
    expect(server.db.categories).toHaveLength(1);
    expect(server.db.categories[0]).toEqual({
      name: "splendid software",
      id: "1",
      isPublished: true,
      publishedAt: "2016-01-01 12:00:00",
    });
  });

  test("build throws errors when using trait that is not defined and distinquishes between traits and non-traits", async () => {
    server.config({
      factories: {
        article: Factory.extend({
          title: "Lorem ipsum",

          published: trait({
            isPublished: true,
            publishedAt: "2010-01-01 10:00:00",
          }),

          private: {
            someAttr: "value",
          },
        }),
      },
    });

    await expect(async () => {
      await server.build("article", "private");
    }).rejects.toThrow("'private' trait is not registered in 'article' factory");
  });

  test("build does not build objects and throws error if model is not registered and association helper is used", async () => {
    server.config({
      factories: {
        article: Factory.extend({
          title: "Lorem ipsum",

          withCategory: trait({
            category: association("published", {
              publishedAt: "2016-01-01 12:00:00",
            }),
          }),
        }),
        category: Factory.extend({
          name: "splendid software",

          published: trait({
            isPublished: true,
            publishedAt: "2014-01-01 10:00:00",
          }),
        }),
      },
      models: {
        category: Model.extend(),
      },
    });

    await expect(async () => {
      await server.build("article", "withCategory");
    }).rejects.toThrow("Mirage: Model not registered: article");
  });

  test("build does not build objects and throws error if model for given association is not registered", async () => {
    server.config({
      factories: {
        article: Factory.extend({
          title: "Lorem ipsum",

          withCategory: trait({
            category: association("published", {
              publishedAt: "2016-01-01 12:00:00",
            }),
          }),
        }),
        category: Factory.extend({
          name: "splendid software",

          published: trait({
            isPublished: true,
            publishedAt: "2014-01-01 10:00:00",
          }),
        }),
      },
      models: {
        article: Model.extend(),
      },
    });

    await expect(async () => {
      await server.build("article", "withCategory");
    }).rejects.toThrow(
      "Mirage: You're using the `association` factory helper on the 'category' attribute of your article factory, but that attribute is not a `belongsTo` association."
    );
  });
});

describe("Unit | Server #buildList", function () {
  let server = null;
  beforeEach(function () {
    server = new Server({ environment: "test" });
  });

  afterEach(function () {
    server.shutdown();
  });

  test("buildList does not add elements to the db", () => {
    server.loadFactories({
      contact: Factory.extend({ name: "Sam" }),
    });

    server.buildList("contact", 3);
    let contactsInDb = server.db.contacts;

    expect(contactsInDb).toHaveLength(0);
  });

  test("buildList returns the built elements without ids", () => {
    server.loadFactories({
      contact: Factory.extend({ name: "Sam" }),
    });

    server.create("contact");
    let contacts = server.buildList("contact", 3);

    expect(contacts).toHaveLength(3);
    expect(contacts[0]).toEqual({ name: "Sam" });
    expect(contacts[1]).toEqual({ name: "Sam" });
    expect(contacts[2]).toEqual({ name: "Sam" });
  });

  test("buildList respects sequences", () => {
    server.loadFactories({
      contact: Factory.extend({
        name(i) {
          return `name${i}`;
        },
      }),
    });

    let contacts = server.buildList("contact", 3);

    expect(contacts[0]).toEqual({ name: "name0" });
    expect(contacts[1]).toEqual({ name: "name1" });
    expect(contacts[2]).toEqual({ name: "name2" });
  });

  test("buildList respects attr overrides", () => {
    server.loadFactories({
      contact: Factory.extend({ name: "Sam" }),
    });

    let sams = server.buildList("contact", 2);
    let links = server.buildList("contact", 2, { name: "Link" });

    expect(sams[0]).toEqual({ name: "Sam" });
    expect(sams[1]).toEqual({ name: "Sam" });
    expect(links[0]).toEqual({ name: "Link" });
    expect(links[1]).toEqual({ name: "Link" });
  });

  test("buildList respects traits", () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),

      withContent: trait({
        content: "content",
      }),
    });

    server.loadFactories({
      article: ArticleFactory,
    });

    let articles = server.buildList("article", 2, "published", "withContent");

    expect(articles[0]).toEqual({
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2010-01-01 10:00:00",
      content: "content",
    });
    expect(articles[1]).toEqual({
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2010-01-01 10:00:00",
      content: "content",
    });
  });

  test("buildList respects traits with attr overrides", () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),

      withContent: trait({
        content: "content",
      }),
    });

    server.loadFactories({
      article: ArticleFactory,
    });

    let overrides = { publishedAt: "2012-01-01 10:00:00" };
    let articles = server.buildList(
      "article",
      2,
      "published",
      "withContent",
      overrides
    );

    expect(articles[0]).toEqual({
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2012-01-01 10:00:00",
      content: "content",
    });
    expect(articles[1]).toEqual({
      title: "Lorem ipsum",
      isPublished: true,
      publishedAt: "2012-01-01 10:00:00",
      content: "content",
    });
  });

  test("buildList throws errors when using trait that is not defined and distinquishes between traits and non-traits", async () => {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),

      private: {
        someAttr: "value",
      },
    });

    server.loadFactories({
      article: ArticleFactory,
    });

    await expect(async () => {
      await server.buildList("article", 2, "private");
    }).rejects.toThrow("'private' trait is not registered in 'article' factory");
  });

  test("buildList throws an error if the second argument is not an integer", async function () {
    let ArticleFactory = Factory.extend({
      title: "Lorem ipsum",

      published: trait({
        isPublished: true,
        publishedAt: "2010-01-01 10:00:00",
      }),
    });

    server.loadFactories({
      article: ArticleFactory,
    });

    await expect(async () => {
      await server.buildList("article", "published");
    }).rejects.toThrow(
      "Mirage: second argument has to be an integer, you passed: string"
    );
  });

  test("Collection.sort() with async comparator should await the comparator", async () => {
    // Reproduces Atlas issue where route handlers use .sort() with async comparators
    // e.g., projects.sort(async (a, b) => { ... })
    // The sort happens synchronously and returns immediately with wrong/undefined results
    
    let Project = Model.extend({});
    let server = new Server({
      environment: "test",
      models: {
        project: Project,
      },
    });

    // Create projects with different names
    await server.create("project", { name: "zebra-project" });
    await server.create("project", { name: "alpha-project" });
    await server.create("project", { name: "middle-project" });

    // Get all projects
    let projects = await server.schema.projects.all();
    
    // Sort with an async comparator (simulating Atlas route handler pattern)
    // This should await the comparator function calls
    let sorted = await projects.sort(async (a, b) => {
      // Simulate async work (e.g., accessing related models)
      await new Promise(resolve => setTimeout(resolve, 1));
      return a.name.localeCompare(b.name);
    });

    // The sorted collection should have items in alphabetical order
    expect(sorted.models.length).toBe(3);
    expect(sorted.models[0].name).toBe("alpha-project");
    expect(sorted.models[1].name).toBe("middle-project");
    expect(sorted.models[2].name).toBe("zebra-project");

    server.shutdown();
  });

  test("Collection.filter() with async predicate should await the predicate", async () => {
    // Reproduces Atlas issue where route handlers use .filter() with async predicates
    // e.g., projects.filter(async (p) => { return await someCheck(p); })
    
    let Project = Model.extend({});
    let server = new Server({
      environment: "test",
      models: {
        project: Project,
      },
    });

    // Create projects
    await server.create("project", { name: "active-1", isActive: true });
    await server.create("project", { name: "inactive-1", isActive: false });
    await server.create("project", { name: "active-2", isActive: true });

    // Get all projects
    let projects = await server.schema.projects.all();
    
    // Filter with an async predicate (simulating Atlas route handler pattern)
    let filtered = await projects.filter(async (project) => {
      // Simulate async work (e.g., checking permissions)
      await new Promise(resolve => setTimeout(resolve, 1));
      return project.isActive === true;
    });

    // The filtered collection should only have active projects
    expect(filtered.models.length).toBe(2);
    expect(filtered.models[0].name).toBe("active-1");
    expect(filtered.models[1].name).toBe("active-2");

    server.shutdown();
  });

  test("schema.where() with async predicate should await the predicate", async () => {
    // Reproduces Atlas issue where route handlers use schema.where() with async predicates
    // e.g., schema.projects.where(async (p) => { return await someCheck(p); })
    
    let Project = Model.extend({});
    let server = new Server({
      environment: "test",
      models: {
        project: Project,
      },
    });

    // Create projects
    await server.create("project", { name: "active-1", isActive: true });
    await server.create("project", { name: "inactive-1", isActive: false });
    await server.create("project", { name: "active-2", isActive: true });

    // Use schema.where with async predicate (simulating Atlas route handler pattern)
    let filtered = await server.schema.projects.where(async (project) => {
      // Simulate async work (e.g., checking permissions)
      await new Promise(resolve => setTimeout(resolve, 1));
      return project.isActive === true;
    });

    // The filtered collection should only have active projects
    expect(filtered.models.length).toBe(2);
    expect(filtered.models[0].name).toBe("active-1");
    expect(filtered.models[1].name).toBe("active-2");

    server.shutdown();
  });
});
