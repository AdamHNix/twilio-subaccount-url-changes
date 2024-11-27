require("dotenv").config();
const retry = require('./retry-handler.js');
const twilio = require("twilio");

// Twilio credentials
const {
  ACCOUNT_SID: accountSid,
  AUTH_TOKEN: authToken,
  VOICE_URL: voiceUrl,
  MESSAGING_URL: messagingUrl,
  STUDIO_URL: studioUrl,
  OLD_VOICE_URL: oldVoiceUrl,
  OLD_MESSAGING_URL: oldMessagingUrl,
  OLD_STUDIO_URL: oldStudioUrl
} = process.env;

const client = twilio(accountSid, authToken);

// list subaccounts to change
const subaccountArray = ['ADD SUBACCOUNTS HERE'];

// fetch specific subaccount
async function fetchAccount(account) {
  return await client.api.v2010.accounts(account).fetch();
}

async function updateSubaccounts() {
  try {
    subaccountArray.forEach(async (subaccount) => {
    // fetch subaccount
      const sub = await fetchAccount(subaccount);

      console.log(
        `Processing Subaccount: ${sub.friendlyName} (${sub.sid})`,
      );
      //initialize subaccount client
      const subClient = twilio(sub.sid, sub.authToken);

      // Update Incoming Phone Numbers
      const phoneNumbers = await subClient.incomingPhoneNumbers.list();
      for (const phoneNumber of phoneNumbers) {
        if (
          phoneNumber.voiceUrl === oldVoiceUrl &&
          phoneNumber.smsUrl === oldMessagingUrl
        ) {
          console.log(
            `Updating phone number message and voice ${phoneNumber.phoneNumber}`,
          );
          await subClient.incomingPhoneNumbers(phoneNumber.sid).update({
            voiceUrl: voiceUrl,
            smsUrl: messagingUrl,
          });
        } else if (phoneNumber.voiceUrl === oldVoiceUrl) {
          console.log(`Updating phone number voice ${phoneNumber.phoneNumber}`);
          await subClient.incomingPhoneNumbers(phoneNumber.sid).update({
            voiceUrl: voiceUrl,
          });
        } else if (phoneNumber.smsUrl === oldMessagingUrl) {
          console.log(
            `Updating phone number message ${phoneNumber.phoneNumber}`,
          );
          await subClient.incomingPhoneNumbers(phoneNumber.sid).update({
            smsUrl: messagingUrl,
          });
        }
      }

      // Update Messaging Services
      const messagingServices = await subClient.messaging.services.list();
      for (const service of messagingServices) {
        if (service.inboundRequestUrl === oldMessagingUrl) {
          console.log(`Updating Messaging Service: ${service.sid}`);
          await subClient.messaging.services(service.sid).update({
            inboundRequestUrl: messagingUrl,
          });
        }
      }

      // Update Studio Flows
      const studioFlows = await subClient.studio.flows.list();
      for (const flow of studioFlows) {
        console.log(`Processing Studio Flow: ${flow.sid}`);

        // Fetch flow definition
        const flowDefinition = await subClient.studio.flows(flow.sid).fetch();
        // Parse flow definition and update HTTP Request widgets
        // TODO: Adam to add extra parameter
        let updated = false;
        const definition = flowDefinition.definition;
        for (const widget of Object.values(definition.states)) {
          if (
            widget.type === "make-http-request" &&
            widget.properties &&
            widget.properties.url === oldStudioUrl
          ) {
            console.log(
              `Updating widget: ${widget.name} URL from ${widget.properties.url} to ${studioUrl}`,
            );
            console.log("params", widget.properties.parameters)
            if (!widget.properties.parameters){
                widget.properties.parameters = [];
            }
            widget.properties.parameters.push({value: "{{trigger.message.MessageSid}}", key: "messageSid"})
            widget.properties.url = studioUrl;
            console.log("params", widget.properties.parameters)
            updated = true;
          }
        }

        // Publish updated flow if changes were made
        if (updated) {
          await subClient.studio.flows(flow.sid).update({
            definition: definition,
            status: "published",
          });
          console.log(`Studio Flow ${flow.sid} updated and republished.`);
        }
      }
    });
  } catch (error) {
    console.error("Error updating subaccounts:", error.message);
  }
}

// Start the script
updateSubaccounts().then(() => console.log("updates completed"));
