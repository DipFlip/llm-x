import {
  useRef,
  PropsWithChildren,
  MouseEvent,
  useEffect,
  useState,
  KeyboardEvent,
  ChangeEvent,
} from 'react'
import _ from 'lodash'
import { observer } from 'mobx-react-lite'
import ScrollableFeed from 'react-scrollable-feed'

import { chatStore } from '../models/ChatStore'
import { settingStore } from '../models/SettingStore'
import { IMessageModel } from '../models/MessageModel'
import { personaStore } from '../models/PersonaStore'

import { IncomingMessage, Message, MessageToEdit } from '../components/Message'
import Paperclip from '../icons/Paperclip'
import ChevronDown from '../icons/ChevronDown'
import ChatBoxPrompt from '../components/ChatBoxPrompt'

const ChatBoxInputRow = observer(
  ({
    onSend,
    children,
  }: PropsWithChildren<{ onSend: (message: string, image?: string) => void }>) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [messageContent, setMessageContent] = useState('')

    const chat = chatStore.selectedChat!
    const { previewImage, messageToEdit } = chat

    const onFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()

      sendMessage()
    }

    const sendMessage = () => {
      if (!textareaRef.current) return

      const userMessage = textareaRef.current.value || ''

      onSend(userMessage, previewImage)

      setMessageContent('')
      textareaRef.current.focus()

      chat.setPreviewImage(undefined)
    }

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]

      if (!file) {
        return
      }

      // reset file input
      event.target.value = ''

      chat.setPreviewImage(file)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) return

      if (e.key === 'Enter') {
        sendMessage()
      }
    }

    const noServer = !settingStore.selectedModel
    const inputDisabled = chatStore.isGettingData || noServer

    useEffect(() => {
      if (!textareaRef.current) return

      setMessageContent(messageToEdit?.content || '')
    }, [messageToEdit])

    // can revisit if this slows things down but its been fine so far
    const lineCount = messageContent.split('\n').length

    return (
      <div
        className={
          'no-scrollbar mt-2 h-fit w-full shrink-0 ' + (noServer && 'tooltip cursor-not-allowed')
        }
        data-tip="Server is not connected"
      >
        <form
          className={
            'join join-vertical h-full min-h-fit w-full rounded-md border border-base-content/20 ' +
            (inputDisabled ? 'bg-base-200' : '')
          }
          onSubmit={onFormSubmit}
        >
          <div className="join-item relative p-2">
            <textarea
              className="no-scrollbar textarea textarea-ghost ml-2 h-full max-h-[400px] w-full resize-none overflow-scroll border-0 p-0 text-base focus:outline-none"
              placeholder="Enter Prompt"
              ref={textareaRef}
              disabled={inputDisabled}
              value={messageContent}
              rows={lineCount}
              onKeyDown={handleKeyDown}
              onChange={e => setMessageContent(e.target.value)}
              autoFocus
            />

            {/* TODO: add persona information here */}

            {previewImage && (
              <div className="absolute bottom-full end-0 mb-2 w-fit">
                <div className="relative h-full w-fit">
                  <div
                    className="btn btn-xs absolute right-1 top-1 opacity-70"
                    onClick={() => chat.setPreviewImage(undefined)}
                  >
                    x
                  </div>

                  <img
                    src={previewImage}
                    className="m-auto max-h-24 max-w-24 place-self-end rounded-md object-scale-down object-right"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="join-item flex w-full flex-row justify-between gap-2 bg-base-200 align-middle">
            <button
              tabIndex={0}
              type="button"
              className="btn btn-active rounded-none rounded-bl-md"
              disabled={inputDisabled}
              onClick={() => personaStore.openSelectionModal()}
            >
              {personaStore.selectedPersona?.name || 'No personas selected'}
              <ChevronDown />
            </button>

            <div className="flex">
              {/* hidden file input */}
              <input
                style={{ display: 'none' }}
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
              />

              <button
                className={'btn btn-ghost rounded-r-none'}
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={inputDisabled}
              >
                <Paperclip />
              </button>

              {chat.isEditingMessage && (
                <button
                  className="btn btn-ghost text-error/50 hover:text-error"
                  type="button"
                  disabled={noServer}
                  onClick={() => chat.setMessageToEdit(undefined)}
                >
                  Cancel
                </button>
              )}

              {children || (
                <button
                  className="btn btn-ghost rounded-none rounded-br-md bg-base-100"
                  disabled={noServer || _.isEmpty(messageContent)}
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    )
  },
)

const ChatBox = observer(() => {
  const chat = chatStore.selectedChat

  const scrollableFeedRef = useRef<ScrollableFeed>(null)

  const sendMessage = async (incomingMessage: IMessageModel) => {
    if (!chat) return

    chat.generateMessage(incomingMessage).finally(() => {
      scrollableFeedRef.current?.scrollToBottom()
    })
  }

  if (!chat) return null

  const handleMessageToSend = (userMessageContent: string, image?: string) => {
    console.timeLog('handling message')

    if (chat.messageToEdit) {
      chat.commitMessageToEdit(userMessageContent, image)

      chat.findAndRegenerateResponse()
    } else {
      chat.addUserMessage(userMessageContent, image)

      const incomingMessage = chat.createAndPushIncomingMessage()
      sendMessage(incomingMessage)
    }
  }

  const handleMessageStopped = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()

    chat.abortGeneration()
  }

  const disableRegeneration = !!chat.incomingMessage
  const isEditingMessage = chat.isEditingMessage
  const incomingUniqId = chat.incomingMessage?.uniqId
  const outgoingUniqId = chat.messageToEdit?.uniqId

  const renderMessage = (message: IMessageModel) => {
    if (message.uniqId === incomingUniqId)
      return <IncomingMessage key={message.uniqId + message.content} />

    if (message.uniqId === outgoingUniqId)
      return <MessageToEdit key={message.uniqId} message={message} />

    return (
      <Message
        message={message}
        key={message.uniqId}
        onDestroy={() => chat.deleteMessage(message)}
        disableRegeneration={disableRegeneration}
        disableEditing={isEditingMessage}
        shouldDimMessage={isEditingMessage}
      />
    )
  }

  return (
    <div className="flex max-h-full min-h-full w-full min-w-full max-w-full flex-col overflow-x-auto overflow-y-hidden rounded-md">
      <ScrollableFeed
        ref={scrollableFeedRef}
        className="no-scrollbar flex flex-1 flex-col gap-2 overflow-x-hidden overflow-y-hidden"
        animateScroll={(element, offset) => element.scrollBy({ top: offset, behavior: 'smooth' })}
      >
        {chat.messages.length > 0 ? chat.messages.map(renderMessage) : <ChatBoxPrompt />}
      </ScrollableFeed>

      <ChatBoxInputRow onSend={handleMessageToSend}>
        {chat.isGettingData && (
          <button
            type="button"
            className="btn btn-ghost rounded-r-none text-error/50 hover:text-error"
            onClick={handleMessageStopped}
          >
            Stop
          </button>
        )}
      </ChatBoxInputRow>
    </div>
  )
})

export default ChatBox
