Comments

TODOIST API DOCUMENTATION
An example Comment object:
{
    content: "Need one bottle of milk",
    id: "2992679862",
    postedAt: "2016-09-22T07:00:00.000000Z",
    projectId: null,
    taskId: "2995104339",
    attachment: {
        fileName: "File.pdf",
        fileType: application/pdf,
        fileUrl: "https://s3.amazonaws.com/domorebetter/Todoist+Setup+Guide.pdf",
        resourceType: "file"
    }
}
Properties

Property	Description
id
String
Comment ID.
task_id
String
Comment's task ID (will be null if the comment belongs to a project).
project_id
String
Comment's project ID (will be null if the comment belongs to a task).
posted_at
String
Date and time when comment was added, RFC3339 format in UTC.
content
String
Comment content. This value may contain markdown-formatted text and hyperlinks. Details on markdown support can be found in the Text Formatting article in the Help Center.
attachment
Object
Attachment file (will be null if there is no attachment).
The optional attachment attribute describes object with attachment metadata. Format of this object depends on the kind of attachment it describes, see Sync API documentation for format details.

Get all comments
Get all comments:
import { TodoistApi } from "@doist/todoist-api-typescript"

const api = new TodoistApi("0123456789abcdef0123456789")

api.getComments({ taskId: "2995104339" })
    .then((comments) => console.log(comments))
    .catch((error) => console.log(error))
Example response:
[
    {
        content: "Need one bottle of milk",
        id: "2992679862",
        postedAt: "2016-09-22T07:00:00.000000Z",
        projectId: null,
        taskId: "2995104339",
        attachment: {
            fileName: "File.pdf",
            fileType: "application/pdf",
            fileUrl: "https://cdn-domain.tld/path/to/file.pdf",
            resourceType: "file"
        }
    }
]
Returns a JSON-encoded array of all comments for a given task_id or project_id. Note that one of task_id or project_id arguments is required.

A successful response has 200 OK status and application/json Content-Type.

Parameters

Parameter	Required	Description
project_id
String
Yes (or task_id)	ID of the project used to filter comments.
task_id
String
Yes (or project_id)	ID of the task used to filter comments.
Create a new comment
Create a new comment:
import { TodoistApi } from "@doist/todoist-api-typescript"

const api = new TodoistApi("0123456789abcdef0123456789")

api.addComment({
    taskId: "2995104339",
    content: "Need one bottle of milk",
    attachment: {
        resourceType: "file",
        fileUrl: "https://s3.amazonaws.com/domorebetter/Todoist+Setup+Guide.pdf",
        fileType: "application/pdf",
        fileName: "File.pdf",
    },
})
    .then((comment) => console.log(comment))
    .catch((error) => console.log(error))
Example response:
{
    content: "Need one bottle of milk",
    id: "2992679862",
    postedAt: "2016-09-22T07:00:00.000000Z",
    projectId: null,
    taskId: "2995104339",
    attachment: {
        fileName: "File.pdf",
        fileType: "application/pdf",
        fileUrl: "https://s3.amazonaws.com/domorebetter/Todoist+Setup+Guide.pdf",
        resourceType: "file"
    }
}
Creates a new comment on a project or task and returns it as a JSON object. Note that one of task_id or project_id arguments is required.

A successful response has 200 OK status and application/json Content-Type.

JSON body parameters

Parameter	Required	Description
task_id
String
Yes (or project_id)	Comment's task ID (for task comments).
project_id
String
Yes (or task_id)	Comment's project ID (for project comments).
content
String
Yes	Comment content. This value may contain markdown-formatted text and hyperlinks. Details on markdown support can be found in the Text Formatting article in the Help Center.
attachment
Object
No	Object for attachment object.
Get a comment
Get a comment:
import { TodoistApi } from "@doist/todoist-api-typescript"

const api = new TodoistApi("0123456789abcdef0123456789")

api.getComment("2992679862")
    .then((comment) => console.log(comment))
    .catch((error) => console.log(error))
Example response:
{
    content: "Need one bottle of milk",
    id: "2992679862",
    postedAt: "2016-09-22T07:00:00.000000Z",
    projectId: null,
    taskId: "2995104339",
    attachment: {
        fileName: "File.pdf",
        fileType: "application/pdf",
        fileUrl: "https://s3.amazonaws.com/domorebetter/Todoist+Setup+Guide.pdf",
        resourceType: "file"
    }
}
Returns a single comment as a JSON object.

A successful response has 200 OK status and application/json Content-Type.

Update a comment
Update a comment:
import { TodoistApi } from "@doist/todoist-api-typescript"

const api = new TodoistApi("0123456789abcdef0123456789")

api.updateComment("2995104339", { content: "Need two bottles of milk" })
    .then((isSuccess) => console.log(isSuccess))
    .catch((error) => console.log(error))
Example response:
{
    content: "Need one bottle of milk",
    id: "2992679862",
    postedAt: "2016-09-22T07:00:00.000000Z",
    projectId: null,
    taskId: "2995104339",
    attachment: {
        fileName: "File.pdf",
        fileType: "application/pdf",
        fileUrl: "https://s3.amazonaws.com/domorebetter/Todoist+Setup+Guide.pdf",
        resourceType: "file"
    }
}
Returns the updated comment as a JSON object.

A successful response has 200 OK status and application/json Content-Type.

JSON body parameters

Parameter	Required	Description
content
String
Yes	New content for the comment. This value may contain markdown-formatted text and hyperlinks. Details on markdown support can be found in the Text Formatting article in the Help Center.
Delete a comment
Delete a comment:
import { TodoistApi } from "@doist/todoist-api-typescript"

const api = new TodoistApi("0123456789abcdef0123456789")

api.deleteComment("2995104339")
    .then((isSuccess) => console.log(isSuccess))
    .catch((error) => console.log(error))
The API returns an empty response with status 204. SDK clients will respond with true to indicate success.
Deletes a comment.

A successful response has 204 No Content status and an empty body.

Labels

An example personal label object:
{
    id: "2156154810",
    name: "Food",
    color: "charcoal",
    order: 1,
    isFavorite: false
}
There are two types of labels that can be added to Todoist tasks. We refer to these as "personal" and "shared" labels.

Personal labels

Labels created by the current user will show up in their personal label list. These labels can be customized and will stay in their account unless deleted.

A personal label can be converted to a shared label by the user if they no longer require them to be stored against their account, but they still appear on shared tasks.

Shared labels

A label created by a collaborator that doesn’t share a name with an existing personal label will appear in our clients as a shared label. These labels are gray by default and will only stay in the shared labels list if there are any active tasks with this label.

A user can convert a shared label to a personal label at any time. The label will then become customizable and will remain in the account even if not assigned to any active tasks.

You can find more information on the differences between personal and shared labels in our Help Center.

Properties (only applicable to personal labels)

Property	Description
id
String
Label ID.
name
String
Label name.
color
String
The color of the label icon. Refer to the name column in the Colors guide for more info.
order
Integer
Number used by clients to sort list of labels.
is_favorite
Boolean
Whether the label is a favorite (a true or false value).
Get all personal labels
Get all personal labels:
import { TodoistApi } from "@doist/todoist-api-typescript"

const api = new TodoistApi("0123456789abcdef0123456789")

api.getLabels()
    .then((labels) => console.log(labels))
    .catch((error) => console.log(error))
Example response:
[
    {
        id: "2156154810",
        name: "Food",
        color: "charcoal",
        order: 1,
        isFavorite: false
    }
]
Returns a JSON-encoded array containing all user labels.

A successful response has 200 OK status and application/json Content-Type.

Create a new personal label
Create a new personal label:
import { TodoistApi } from "@doist/todoist-api-typescript"

const api = new TodoistApi("0123456789abcdef0123456789")

api.addLabel({ name: "Food" })
    .then((label) => console.log(label))
    .catch((error) => console.log(error))
Example response:
{
    id: "2156154810",
    name: "Food",
    color: "charcoal",
    order: 1,
    isFavorite: false
}
Creates a new personal label and returns its object as JSON.

A successful response has 200 OK status and application/json Content-Type.

JSON body parameters

Parameter	Required	Description
name
String
Yes	Name of the label.
order
Integer
No	Label order.
color
String
No	The color of the label icon. Refer to the name column in the Colors guide for more info.
is_favorite
Boolean
No	Whether the label is a favorite (a true or false value).
Get a personal label
Get a personal label:
import { TodoistApi } from "@doist/todoist-api-typescript"

const api = new TodoistApi("0123456789abcdef0123456789")

api.getLabel("2156154810")
    .then((label) => console.log(label))
    .catch((error) => console.log(error))
Example response:
{
    id: "2156154810",
    name: "Food",
    color: "charcoal",
    order: 1,
    isFavorite: false
}
Returns a personal label by ID.

A successful response has 200 OK status and application/json Content-Type.

Update a personal label
Update a personal label:
import { TodoistApi } from "@doist/todoist-api-typescript"

const api = new TodoistApi("0123456789abcdef0123456789")

api.updateLabel("2156154810", { name: "Drinks" })
    .then((isSuccess) => console.log(isSuccess))
    .catch((error) => console.log(error))
Example response:
{
    id: "2156154810",
    name: "Drinks",
    color: "charcoal",
    order: 1,
    isFavorite: false
}
Returns the updated label.

A successful response has 200 OK status and application/json Content-Type.

JSON body parameters

Parameter	Required	Description
name
String
No	New name of the label.
order
Integer
No	Number that is used by clients to sort list of labels.
color
String
No	The color of the label icon. Refer to the name column in the Colors guide for more info.
is_favorite
Boolean
No	Whether the label is a favorite (a true or false value).
Delete a personal label
Delete a personal label:
import { TodoistApi } from "@doist/todoist-api-typescript"

const api = new TodoistApi("0123456789abcdef0123456789")

api.deleteLabel("2156154810")
    .then((isSuccess) => console.log(isSuccess))
    .catch((error) => console.log(error))
The API returns an empty response with status 204. SDK clients will respond with true to indicate success.
Deletes a personal label. All instances of the label will be removed from tasks.

A successful response has 204 No Content status and an empty body.

Get all shared labels
Get all shared labels:
import { TodoistApi } from "@doist/todoist-api-typescript"

const api = new TodoistApi("0123456789abcdef0123456789")

api.getSharedLabels()
    .then((labels) => console.log(labels))
    .catch((error) => console.log(error))
Example response:
[
    "Label1",
    "Label2",
    "Label3"
]
Returns a JSON-encoded array containing the names of all labels currently assigned to tasks.

By default, the names of a user's personal labels will also be included. These can be excluded by passing the omit_personal parameter.

A successful response has 200 OK status and application/json Content-Type.

Parameter	Required	Description
omit_personal
Boolean
No	Whether to exclude the names of the user's personal labels from the results. The default value is false.
Rename shared labels
Rename shared labels:
import { TodoistApi } from "@doist/todoist-api-typescript"

const api = new TodoistApi("0123456789abcdef0123456789")

api.renameSharedLabels({ name: "MyLabel", newName: "RenamedLabel" })
    .then((isSuccess) => console.log(isSuccess))
    .catch((error) => console.log(error))
The API returns an empty response with status 204. SDK clients will respond with true to indicate success.
Renames all instances of a shared label.

A successful response has 204 No Content status and an empty body.

JSON body parameters

Parameter	Required	Description
name
String
Yes	The name of the existing label to rename.
new_name
String
Yes	The new name for the label.
Remove shared labels
Remove shared labels:
import { TodoistApi } from "@doist/todoist-api-typescript"

const api = new TodoistApi("0123456789abcdef0123456789")

api.removeSharedLabels({ name: "MyLabel" })
    .then((isSuccess) => console.log(isSuccess))
    .catch((error) => console.log(error))
The API returns an empty response with status 204. SDK clients will respond with true to indicate success.
Removes all instances of a shared label from the tasks where it is applied. If no instances of the label name are found, the request will still be considered successful.

A successful response has 204 No Content status and an empty body.

JSON body parameters

Parameter	Required	Description
name
String
Yes	The name of the label to remove.
